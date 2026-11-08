import {
  failedBecause,
  hubUpdateFinished,
  HUB_UNIT,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { dirname, join } from 'node:path';
import { withHubReleaseLock } from '../apps/hub/src/self-update/release-lock.ts';
import {
  captureBackup,
  cleanVerifiedBackup,
  checksOf,
  current,
  ledgerOf,
  message,
  revert,
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

async function failed(flow: Flow, verdict: Verdict): Promise<HubUpdateRelease> {
  transition(flow, 'verifying', { failedChecks: verdict.checks.filter((check) => !check.ok) });
  return await revert(flow, `the new release failed its checks: ${failedBecause(verdict.checks)}`);
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
  if (!verdict.ok) return await failed(flow, verdict);

  flow.storage.makeDirectory(dirname(flow.options.health));
  flow.storage.write(flow.options.health, 'healthy\n');
  flow.note('hub_update.done', {});
  const release = transition(flow, 'done', {
    reason: null,
    checks: [...verdict.checks],
    changedDatabase: flow.health.schema(flow.options.database) !== flow.options.startingSchema,
    failedChecks: [],
  });
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
  try {
    if (ready.phase === 'backed_up') await apply(flow, ready);
    if (ready.phase !== 'verifying') flow.units.act('start', HUB_UNIT);
    transition(flow, 'verifying');
    return await kept(flow);
  } catch (cause) {
    flow.note('hub_update.guard', { reason: message(cause) });
    return await revert(flow, `the update failed: ${message(cause)}`);
  }
}

function recoveryReason(flow: Flow, release: HubUpdateRelease): string | null {
  if (release.phase === 'unrecoverable' && flow.options.retryUnrecoverable)
    return release.reason ?? 'retrying the recorded backup restoration';
  if (release.phase === 'applying' || release.phase === 'reverting')
    return release.reason ?? 'the update stopped while replacing the service';
  return null;
}

export async function handle(flow: Flow): Promise<HubUpdateRelease> {
  const release = current(flow);
  const reason = recoveryReason(flow, release);
  if (reason !== null) return await revert(flow, reason);
  if (hubUpdateFinished(release)) {
    if (release.phase === 'done' || release.phase === 'reverted') cleanVerifiedBackup(flow);
    return release;
  }
  if (release.phase === 'planned' || (release.phase === 'built' && release.backup === null))
    return transition(flow, 'failed', { reason: 'the update stopped before a backup was ready' });
  return await finishPrepared(flow, release);
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
