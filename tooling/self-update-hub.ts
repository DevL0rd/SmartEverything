import {
  constants,
  copyFileSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
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
import { UPDATE_ENTRY_DIRECTORY, UPDATE_ENTRY_FILES } from './hub-install-layout.ts';
import { latestRelease, type SelfUpdatePaths } from './self-update-files.ts';
import { checkOf, changeJob, type JobStore, type UpdateJob } from './self-update-job.ts';
import { logTail, note, plan, unfinished, update } from './self-update-plan.ts';
import {
  WATCHDOG_OPTIONS,
  type WatchdogOptions,
  type WatchdogOrder,
} from './self-update-watchdog-contract.ts';
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

export type HubRunTools = Omit<HubTools, 'candidate'>;

function optionsFile(tools: HubRunTools, runId: string): string {
  return join(tools.paths.work, `${runId}.json`);
}

function watchdogEntry(tools: HubRunTools, runId: string): string {
  return join(tools.paths.work, `${runId}-watchdog.mjs`);
}

function serviceBuild(tools: HubRunTools, runId: string): string {
  return join(tools.paths.work, `${runId}-service`);
}

function keepWatchdog(tools: HubRunTools, runId: string, build: string): void {
  const shipped = join(build, UPDATE_ENTRY_DIRECTORY, UPDATE_ENTRY_FILES.watchdog);
  if (!existsSync(shipped))
    throw new Error(
      `The service build has no ${UPDATE_ENTRY_DIRECTORY}/${UPDATE_ENTRY_FILES.watchdog}.`,
    );
  copyFileSync(shipped, watchdogEntry(tools, runId), constants.COPYFILE_EXCL);
}

function discardPreparation(tools: HubRunTools, runId: string): void {
  rmSync(serviceBuild(tools, runId), { recursive: true, force: true });
  rmSync(watchdogEntry(tools, runId), { force: true });
}

function handOff(tools: HubRunTools, options: WatchdogOptions): string {
  const entry = watchdogEntry(tools, options.runId);
  if (!existsSync(entry)) throw new Error(`The watchdog of ${options.runId} is missing.`);
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
    order: 'watch',
  });
}

async function built(
  tools: HubTools,
  release: HubUpdateRelease,
): Promise<{ readonly release: HubUpdateRelease; readonly identity: string }> {
  const build = serviceBuild(tools, release.runId);
  if (existsSync(build)) throw new Error('A service build already exists for this release.');
  await tools.candidate.build(build);
  const problems = builtServiceProblems(build);
  if (problems.length > 0) throw new Error(problems.join('; '));
  const receipt = join(build, HUB_UPDATE_BOOT_RECEIPT_FILE);
  if (existsSync(receipt)) throw new Error('The service build contains a reserved boot receipt.');
  if (serviceIdentity(build, false) === serviceIdentity(tools.target.install.service, false))
    throw new UnchangedHubBuild();
  keepWatchdog(tools, release.runId, build);
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
  let armed = false;
  const { runId } = release;
  try {
    const typeErrors = await tools.candidate.typeErrors();
    release = update(tools, release, {
      checks: [checkOf('type errors', typeErrors === 0, `${String(typeErrors)} in apps/hub`)],
    });
    if (typeErrors > 0) throw new Error('the hub has type errors, so nothing was built or swapped');
    const staged = await built(tools, release);
    release = staged.release;
    const space = freeSpaceProblem(tools.target, serviceBuild(tools, runId));
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
    armed = true;
    handOff(tools, options);
    return { status: 'started', runId };
  } catch (cause) {
    if (!armed) discardPreparation(tools, runId);
    return failHubPreparation(tools, release, cause);
  }
}

function savedOptions(tools: HubRunTools, release: HubUpdateRelease): WatchdogOptions {
  const file = optionsFile(tools, release.runId);
  if (!existsSync(file)) throw new Error(`The recovery record for ${release.runId} is missing`);
  const saved = WATCHDOG_OPTIONS.parse(JSON.parse(readFileSync(file, 'utf8')));
  if (saved.runId !== release.runId)
    throw new Error('The recovery record belongs to another update');
  return saved;
}

function ordered(
  tools: HubRunTools,
  release: HubUpdateRelease,
  order: Exclude<WatchdogOrder, 'watch'>,
  holdSeconds: number,
): string {
  const options = WATCHDOG_OPTIONS.parse({
    ...savedOptions(tools, release),
    holdSeconds,
    order,
  });
  note(tools.watchdogLog, `hub_update.${order}_started`, { runId: release.runId });
  return handOff(tools, options);
}

export function recoverHub(
  tools: HubRunTools,
  release: HubUpdateRelease,
  holdSeconds = 120,
): string {
  if (hubUpdateFinished(release)) return release.watchdogUnit;
  if (
    !existsSync(optionsFile(tools, release.runId)) &&
    (release.phase === 'planned' || release.phase === 'built')
  ) {
    update(tools, release, {
      phase: 'failed',
      reason: 'the update stopped before a backup was ready',
      finishedAt: tools.now().toISOString(),
    });
    return release.watchdogUnit;
  }
  return ordered(tools, release, 'recover', holdSeconds);
}

export function rollbackHub(tools: HubRunTools, release: HubUpdateRelease): string {
  if (release.phase !== 'awaiting_decision' && release.phase !== 'unrecoverable')
    throw new Error(`Hub update ${release.runId} is ${release.phase}, not waiting for a decision`);
  return ordered(tools, release, 'rollback', 0);
}

export function keepHub(tools: HubRunTools, release: HubUpdateRelease): string {
  if (release.phase !== 'awaiting_decision')
    throw new Error(`Hub update ${release.runId} is ${release.phase}, not waiting for a decision`);
  return ordered(tools, release, 'keep', 0);
}

function decisionMessage(release: HubUpdateRelease): string {
  if (release.phase === 'awaiting_decision')
    return `the new release failed and waits for the owner's decision (rollback, recover or keep); its backup is kept: ${release.reason ?? failedBecause(release.failedChecks)}`;
  return `the owner kept the new release as it is although it failed: ${release.reason ?? 'no reason recorded'}; its backup is kept`;
}

export function outcomeMessage(release: HubUpdateRelease): string {
  if (release.phase === 'done') return `the hub is running the new release ${release.runId}`;
  if (release.phase === 'failed')
    return release.reason ?? 'the update stopped before changing the service';
  if (release.phase === 'reverted')
    return `the backup is running again; the owner rolled the new release back: ${release.reason ?? 'no reason recorded'}`;
  if (release.phase === 'kept' || release.phase === 'awaiting_decision')
    return decisionMessage(release);
  const checks = release.failedChecks.length > 0 ? release.failedChecks : release.checks;
  return `the hub could not be restored: ${release.reason ?? failedBecause(checks)}`;
}

export { KEPT_LOG_LINES, latestRelease, logTail };
