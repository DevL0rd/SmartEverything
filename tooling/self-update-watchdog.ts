import {
  failedBecause,
  hubUpdateFinished,
  HUB_UNIT,
  HUB_UPDATE_WAITING,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { dirname, join } from 'node:path';
import { withHubReleaseLock } from '../apps/hub/src/self-update/release-lock.ts';
import {
  awaitDecision,
  captureBackup,
  cleanVerifiedBackup,
  checksOf,
  clearReport,
  current,
  ledgerOf,
  message,
  rollBack,
  transition,
  verifyNew,
  type Flow,
  type Verdict,
} from './self-update-watchdog-engine.ts';
import { WATCHDOG_OPTIONS } from './self-update-watchdog-contract.ts';
import { HUB_SERVICE_DIRECTORY } from './hub-install-layout.ts';
import { assertStandaloneHubUnit } from './release-hub-verify.ts';
import { flowOf } from './self-update-watchdog-live.ts';
import { dataLayoutOf } from './release-hub-files.ts';

function failed(flow: Flow, verdict: Verdict): HubUpdateRelease {
  return awaitDecision(
    flow,
    `the new release failed its checks: ${failedBecause(verdict.checks)}`,
    verdict.checks.filter((check) => !check.ok),
  );
}

async function hold(flow: Flow, initial: Verdict): Promise<Verdict> {
  if (!initial.ok) return initial;
  const deadline = flow.now().getTime() + flow.options.holdSeconds * 1000;
  while (flow.now().getTime() < deadline) {
    await flow.events.next(deadline - flow.now().getTime());
    const checks = await checksOf(flow, flow.options.expectedSchema);
    if (checks.every((check) => check.ok)) continue;
    const recovered = await verifyNew(flow, flow.options.expectedSchema);
    if (!recovered.ok) return recovered;
  }
  return initial;
}

async function kept(flow: Flow): Promise<HubUpdateRelease> {
  const expected = flow.options.expectedSchema;
  const verdict = await hold(flow, await verifyNew(flow, expected));
  if (!verdict.ok) return failed(flow, verdict);

  flow.storage.makeDirectory(dirname(flow.options.health));
  flow.storage.write(flow.options.health, 'healthy\n');
  flow.note('hub_update.done', {});
  const release = transition(flow, 'done', {
    reason: null,
    checks: [...verdict.checks],
    changedDatabase: flow.health.schema(flow.options.database) !== flow.options.startingSchema,
    failedChecks: [],
  });
  clearReport(flow);
  cleanVerifiedBackup(flow);
  return release;
}

function verifyBuild(flow: Flow, release: HubUpdateRelease): void {
  const expected = flow.options.buildIdentity;
  if (expected === undefined) return;
  const build = release.build;
  if (build === null || flow.storage.treeIdentity?.(build) !== expected)
    throw new Error('The staged service changed after verification.');
}

async function apply(flow: Flow, release: HubUpdateRelease): Promise<void> {
  verifyBuild(flow, release);
  if (release.build === null || release.backup === null)
    throw new Error('the prepared release has no build or backup');
  transition(flow, 'applying');
  if (flow.units.active(HUB_UNIT)) flow.units.act('stop', HUB_UNIT);
  flow.storage.removeAny(flow.options.health);
  flow.storage.replaceTree(release.build, flow.options.service);
  await flow.prepareData();
  await flow.refreshUnit();
  transition(flow, 'restarting');
}

async function backupOrResume(flow: Flow, release: HubUpdateRelease): Promise<HubUpdateRelease> {
  if (release.phase !== 'built') return release;
  try {
    return captureBackup(flow);
  } catch (cause) {
    const reason = `the backup failed before changing the service: ${message(cause)}`;
    flow.note('hub_update.backup_failed', { reason });
    flow.units.act('start', HUB_UNIT);
    const hub = await verifyNew(flow, null);
    if (!hub.ok)
      throw new Error(`Could not start the unchanged hub: ${failedBecause(hub.checks)}`, { cause });
    const failed = transition(flow, 'failed', { reason });
    flow.storage.removeAny(flow.options.backup);
    return failed;
  }
}

async function run(flow: Flow, release: HubUpdateRelease): Promise<HubUpdateRelease> {
  try {
    if (release.phase === 'backed_up') await apply(flow, release);
    if (release.phase !== 'verifying') flow.units.act('start', HUB_UNIT);
    transition(flow, 'verifying');
    return await kept(flow);
  } catch (cause) {
    flow.note('hub_update.guard', { reason: message(cause) });
    return awaitDecision(flow, `the update failed: ${message(cause)}`, []);
  }
}

async function finishPrepared(flow: Flow, release: HubUpdateRelease): Promise<HubUpdateRelease> {
  if (release.phase === 'built') {
    try {
      verifyBuild(flow, release);
    } catch (cause) {
      const reason = message(cause);
      flow.note('hub_update.staged_build_changed', { reason });
      return transition(flow, 'failed', { reason });
    }
  }
  const ready = await backupOrResume(flow, release);
  if (hubUpdateFinished(ready)) return ready;
  return await run(flow, ready);
}

const DECIDED: ReadonlySet<HubUpdateRelease['phase']> = new Set([
  'awaiting_decision',
  'unrecoverable',
]);

async function orderedRollback(flow: Flow, release: HubUpdateRelease): Promise<HubUpdateRelease> {
  if (DECIDED.has(release.phase) && release.backup !== null) return await rollBack(flow, release);
  flow.note('hub_update.rollback_refused', { runId: release.runId, phase: release.phase });
  return release;
}

function orderedKeep(flow: Flow, release: HubUpdateRelease): HubUpdateRelease {
  if (release.phase !== 'awaiting_decision') {
    flow.note('hub_update.keep_refused', { runId: release.runId, phase: release.phase });
    return release;
  }
  flow.note('hub_update.kept', { runId: release.runId });
  const kept = transition(flow, 'kept', {
    reason: `the owner kept the new release as it is${release.reason === null ? '' : ` after: ${release.reason}`}`,
  });
  clearReport(flow);
  return kept;
}

async function watched(flow: Flow, release: HubUpdateRelease): Promise<HubUpdateRelease> {
  if (release.phase === 'applying')
    return awaitDecision(
      flow,
      release.reason ?? 'the update stopped while replacing the service',
      release.failedChecks,
    );
  if (hubUpdateFinished(release) || HUB_UPDATE_WAITING.has(release.phase)) {
    if (release.phase === 'done' || release.phase === 'reverted') cleanVerifiedBackup(flow);
    return release;
  }
  if (release.phase === 'planned' || (release.phase === 'built' && release.backup === null))
    return transition(flow, 'failed', { reason: 'the update stopped before a backup was ready' });
  return await finishPrepared(flow, release);
}

export async function handle(flow: Flow): Promise<HubUpdateRelease> {
  const release = current(flow);
  const { order } = flow.options;
  if (order === 'rollback') return await orderedRollback(flow, release);
  if (order === 'keep') return orderedKeep(flow, release);
  if (
    order === 'recover' &&
    (release.phase === 'awaiting_decision' || release.phase === 'applying')
  )
    return await run(flow, { ...release, phase: 'backed_up' });
  return await watched(flow, release);
}

export async function resume(text: string): Promise<void> {
  const options = WATCHDOG_OPTIONS.parse(JSON.parse(text));
  await withHubReleaseLock(dataLayoutOf(options.data), true, async () => {
    const flow = flowOf(options);
    try {
      if (ledgerOf(flow).releases.at(-1)?.runId !== options.runId) {
        flow.note('hub_update.superseded', { runId: options.runId });
        return;
      }
      if (options.service !== join(options.install, HUB_SERVICE_DIRECTORY))
        throw new Error('The update does not target the standalone hub service directory.');
      assertStandaloneHubUnit(options.install);
      await handle(flow);
    } finally {
      flow.events.close();
    }
  });
}
