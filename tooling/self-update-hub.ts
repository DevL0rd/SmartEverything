import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  failedBecause,
  HUB_UPDATE_BOOT_RECEIPT_FILE,
  HUB_UPDATE_RESTART_WAIT_MS,
  hubUpdateFinished,
  type HubUpdateAcceptance,
  type HubUpdateOrigin,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import {
  WATCHDOG_ENTRY,
  buildWatchdog,
  latestRelease,
  type SelfUpdatePaths,
} from './self-update-files.ts';
import { checkOf, changeJob, type JobStore, type UpdateJob } from './self-update-job.ts';
import { logTail, note, plan, unfinished, update } from './self-update-plan.ts';
import { WATCHDOG_OPTIONS, type WatchdogOptions } from './self-update-watchdog-contract.ts';
import { arm, watchdogUnit } from './self-update-watchdog-start.ts';
import { builtServiceProblems, freeSpaceProblem, type ReleaseTarget } from './release-hub-files.ts';

import type { HubBuild } from './self-update-hub-build.ts';
import { ledgerReason } from './self-update-ledger.ts';
import { serviceIdentity } from './self-update-service-identity.ts';

class UnchangedHubBuild extends Error {
  constructor() {
    super('the built service is identical to the installed service');
    this.name = 'UnchangedHubBuild';
  }
}

const KEPT_LOG_LINES = 20;

export interface HubTools {
  readonly data: string;
  readonly url: string;
  readonly node: string;
  readonly target: ReleaseTarget;
  readonly paths: SelfUpdatePaths;
  readonly install: string;
  readonly job: UpdateJob;
  readonly jobs: JobStore;
  readonly ledger: string;
  readonly watchdogLog: string;
  readonly now: () => Date;
  readonly newId: () => string;
  readonly candidate: HubBuild;
}

function optionsFile(tools: HubTools, runId: string): string {
  return join(tools.paths.work, `${runId}.json`);
}

function watchdogEntry(tools: HubTools, runId: string): string {
  return join(tools.paths.work, `${runId}-watchdog.mjs`);
}

function handOff(tools: HubTools, options: WatchdogOptions): string {
  const entry = watchdogEntry(tools, options.runId);
  if (!existsSync(entry)) buildWatchdog(WATCHDOG_ENTRY, entry);
  return arm({
    node: tools.node,
    entry,
    agent: join(tools.paths.work, `${options.runId}-agent.mjs`),
    options,
  });
}

function preparedOptions(
  tools: HubTools,
  release: HubUpdateRelease,
  expectedSchema: number,
  buildIdentity: string,
): WatchdogOptions {
  return WATCHDOG_OPTIONS.parse({
    buildIdentity,
    runId: release.runId,
    url: release.url,
    service: tools.target.install.service,
    install: tools.install,
    database: tools.target.data.system.database.file,
    backup: release.backup,
    ledger: tools.ledger,
    health: release.healthFile,
    data: tools.data,
    startingSchema: release.startingSchema,
    expectedSchema,
    holdSeconds: HUB_UPDATE_RESTART_WAIT_MS / 1000,
    retryUnrecoverable: false,
  });
}

async function built(
  tools: HubTools,
  release: HubUpdateRelease,
): Promise<{ readonly release: HubUpdateRelease; readonly identity: string }> {
  const build = join(tools.paths.work, `${release.runId}-service`);
  if (existsSync(build)) throw new Error('A service build already exists for this release.');
  await tools.candidate.build(build);
  const problems = builtServiceProblems(build);
  if (problems.length > 0) throw new Error(problems.join('; '));
  const receipt = join(build, HUB_UPDATE_BOOT_RECEIPT_FILE);
  if (existsSync(receipt)) throw new Error('The service build contains a reserved boot receipt.');
  if (serviceIdentity(build, false) === serviceIdentity(tools.target.install.service, false))
    throw new UnchangedHubBuild();
  writeFileSync(receipt, JSON.stringify({ runId: release.runId }), { flag: 'wx', mode: 0o600 });
  const identity = serviceIdentity(build);
  return { release: update(tools, release, { build, phase: 'built' }), identity };
}

export function reserveHubUpdate(
  tools: Omit<HubTools, 'candidate' | 'job'>,
  source: {
    readonly notes: string;
    readonly origin?: HubUpdateOrigin;
    readonly remoteTip?: string;
  },
): HubUpdateRelease {
  const runId = tools.newId();
  return plan(
    { ledger: tools.ledger, watchdogLog: tools.watchdogLog, now: tools.now, newId: () => runId },
    {
      ...source,
      build: null,
      backup: null,
      url: tools.url,
      healthFile: tools.paths.health,
      watchdogUnit: watchdogUnit(runId),
      installs: [tools.install],
      startingSchema: null,
    },
  );
}

export function failHubPreparation(
  tools: HubTools,
  release: HubUpdateRelease,
  cause: unknown,
): HubUpdateAcceptance {
  const reason = ledgerReason(cause instanceof Error ? cause.message : String(cause));
  const refusal = cause instanceof UnchangedHubBuild ? 'identity_same' : 'failed';
  const message = `${reason}; the hub was never stopped, so it still runs`;
  changeJob(tools.jobs, tools.job, {
    phase: 'failed',
    detail: message,
    result: { runId: release.runId, refusal },
  });
  update(tools, release, {
    phase: 'failed',
    reason,
    finishedAt: tools.now().toISOString(),
  });
  return {
    status: 'refused',
    refusal,
    runId: release.runId,
    message,
  };
}

export async function selfUpdateHub(
  tools: HubTools,
  notes: string,
  origin?: HubUpdateOrigin,
): Promise<HubUpdateAcceptance> {
  const existing = unfinished(tools.ledger);
  if (existing !== null)
    return {
      status: 'refused',
      refusal: 'busy',
      runId: existing.runId,
      message: `Hub update ${existing.runId} is still open`,
    };
  return await prepareReservedHubUpdate(
    tools,
    reserveHubUpdate(tools, { notes, ...(origin === undefined ? {} : { origin }) }),
  );
}

export async function prepareReservedHubUpdate(
  tools: HubTools,
  reservation: HubUpdateRelease,
): Promise<HubUpdateAcceptance> {
  let release = reservation;
  const { runId } = release;
  try {
    const typeErrors = await tools.candidate.typeErrors();
    release = update(tools, release, {
      checks: [checkOf('type errors', typeErrors === 0, `${String(typeErrors)} in apps/hub`)],
    });
    if (typeErrors > 0) throw new Error('the hub has type errors, so nothing was built or swapped');
    const staged = await built(tools, release);
    release = staged.release;
    const space = freeSpaceProblem(tools.target, join(tools.paths.work, `${runId}-service`));
    if (space !== null) throw new Error(space);
    const { from, to } = await tools.candidate.checkMigrations(tools.target.data);
    const backup = join(
      tools.target.data.backups.releases,
      `hub-${runId}-${String(tools.now().getTime())}`,
    );
    const ready = { ...release, backup, startingSchema: from };
    const options = preparedOptions(tools, ready, to, staged.identity);
    mkdirSync(tools.paths.work, { recursive: true, mode: 0o700 });
    writeFileSync(optionsFile(tools, runId), JSON.stringify(options), { mode: 0o600 });
    release = update(tools, release, { backup, startingSchema: from });
    changeJob(tools.jobs, tools.job, {
      phase: 'running',
      detail: `the watchdog is starting ${runId}`,
      result: { runId, backup },
    });
    handOff(tools, options);
    return { status: 'started', runId };
  } catch (cause) {
    return failHubPreparation(tools, release, cause);
  }
}

export function recoverHub(tools: HubTools, release: HubUpdateRelease, holdSeconds = 120): string {
  if (hubUpdateFinished(release) && release.phase !== 'unrecoverable') return release.watchdogUnit;
  const file = optionsFile(tools, release.runId);
  if (!existsSync(file)) {
    if (release.phase !== 'planned' && release.phase !== 'built')
      throw new Error(`The recovery record for ${release.runId} is missing`);
    update(tools, release, {
      phase: 'failed',
      reason: 'the update stopped before a backup was ready',
      finishedAt: tools.now().toISOString(),
    });
    return release.watchdogUnit;
  }
  const saved = WATCHDOG_OPTIONS.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (saved.runId !== release.runId)
    throw new Error('The recovery record belongs to another update');
  const options = WATCHDOG_OPTIONS.parse({ ...saved, holdSeconds, retryUnrecoverable: true });
  note(tools.watchdogLog, 'hub_update.recovery_started', { runId: release.runId });
  return handOff(tools, options);
}

export function outcomeMessage(release: HubUpdateRelease): string {
  if (release.phase === 'done') return `the hub is running the new release ${release.runId}`;
  if (release.phase === 'failed')
    return release.reason ?? 'the update stopped before changing the service';
  if (release.phase === 'reverted')
    return `the backup is running again; the new release was reverted: ${release.reason ?? 'no reason recorded'}`;
  const checks = release.failedChecks.length > 0 ? release.failedChecks : release.checks;
  return `the hub could not be restored: ${release.reason ?? failedBecause(checks)}`;
}

export { KEPT_LOG_LINES, latestRelease, logTail };
