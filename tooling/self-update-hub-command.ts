import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import { env } from 'node:process';
import {
  HUB_UPDATE_ORIGIN,
  releaseOf,
  UPDATE_INPUT,
  type HubUpdateLedger,
  type HubUpdateOrigin,
  type HubUpdateRelease,
  type UpdateInput,
} from '@smarteverything/domain';
import { z } from 'zod';
import { SERVICE_READY } from '../apps/hub/src/service/configuration.ts';
import {
  HUB_RELEASE_BUSY_EXIT,
  HubReleaseLockError,
  releaseNeedsRecovery,
  withHubReleaseLock,
} from '../apps/hub/src/self-update/release-lock.ts';
import { applyBuildHost, requireBuildHost } from './build-host.ts';
import { HUB_NODE_EXECUTABLE } from './hub-install-layout.ts';
import { assertStandaloneHubUnit } from './release-hub-verify.ts';
import { dataLayoutOf, hubInstall } from './release-hub-files.ts';
import type { StepRequest } from './self-update-commands.ts';
import { runStep } from './self-update-commands.ts';
import { STEP_ENTRY, bundle, readLedger, selfUpdatePaths } from './self-update-files.ts';
import { localHubBuild } from './self-update-hub-build.ts';
import { recoverHub, selfUpdateHub, type HubTools } from './self-update-hub.ts';
import { startJob, type JobStore } from './self-update-job.ts';
import {
  admitRemoteSnapshot,
  discardRemotePreparation,
  prepareRemoteSnapshot,
  previousRemoteRun,
  REMOTE_PREPARATION,
  REMOTE_UPDATE,
} from './self-update-remote.ts';
import { remotePreparationRunning } from './self-update-remote-start.ts';
import { watchdogRunning } from './self-update-watchdog-start.ts';

const COMMAND = z.union([UPDATE_INPUT, REMOTE_UPDATE, REMOTE_PREPARATION]);
type Command =
  | Extract<UpdateInput, { action: 'hub' | 'recover' }>
  | z.infer<typeof REMOTE_UPDATE>
  | z.infer<typeof REMOTE_PREPARATION>;

interface HubEnvironment extends Omit<HubTools, 'job'> {
  readonly runSteps: (step: StepRequest) => ReturnType<typeof runStep>;
}

const INSTALL_PATH = z.string().refine(isAbsolute, {
  message: 'Configure the absolute path to the standalone hub installation.',
});

const now = (): Date => new Date();

function jobsOf(work: string): JobStore {
  return { folder: join(work, 'jobs'), now, newId: randomUUID };
}

function environment(data: string, url: string): HubEnvironment {
  const root = process.cwd();
  const install = INSTALL_PATH.parse(env['SMARTEVERYTHING_SELF_UPDATE_INSTALL']);
  assertStandaloneHubUnit(install);
  const layout = dataLayoutOf(data);
  applyBuildHost(layout, root);
  const paths = selfUpdatePaths(layout);
  const node = join(install, HUB_NODE_EXECUTABLE);
  const jobs = jobsOf(paths.work);
  const runSteps = (step: StepRequest): ReturnType<typeof runStep> => {
    bundle(STEP_ENTRY, paths.step);
    return runStep(node, paths.step, root, step);
  };
  return {
    data,
    install,
    target: { install: hubInstall(install), data: layout },
    paths,
    node,
    jobs,
    now,
    newId: randomUUID,
    url,
    ledger: paths.ledger,
    watchdogLog: paths.watchdogLog,
    candidate: localHubBuild(root, runSteps),
    runSteps,
  };
}

function recover(
  data: string,
  input: Extract<Command, { action: 'recover' }>,
  ledger: HubUpdateLedger,
): Record<string, unknown> {
  const release = releaseOf(ledger, input.id);
  if (release === undefined) return { status: 'refused', refusal: 'not_found' };
  if (ledger.releases.at(-1)?.runId !== release.runId || !releaseNeedsRecovery(release))
    return { status: 'refused', refusal: 'not_recoverable' };
  if (watchdogRunning(input.id) || remotePreparationRunning(input.id))
    return { status: 'refused', refusal: 'busy' };
  const tools = environment(data, release.url);
  discardRemotePreparation(tools.paths.work, release.runId);
  const job = startJob(tools.jobs, 'hub', input, null);
  recoverHub({ ...tools, job }, release, input.holdSeconds);
  return { status: 'started', runId: input.id };
}

async function runPreparation(
  data: string,
  runId: string,
  latest: HubUpdateRelease | undefined,
): Promise<Record<string, unknown>> {
  if (latest?.runId === runId && latest.phase === 'planned')
    await prepareRemoteSnapshot(environment(data, latest.url), latest);
  return { status: 'complete' };
}

async function command(
  data: string,
  input: Command,
  origin: HubUpdateOrigin | undefined,
): Promise<Record<string, unknown>> {
  const paths = selfUpdatePaths(dataLayoutOf(data));
  const ledger = readLedger(paths.ledger);
  if (input.action === 'recover') return recover(data, input, ledger);
  const latest = ledger.releases.at(-1);
  requireBuildHost(dataLayoutOf(data), process.cwd(), 'hub');
  if (input.action === 'prepare_remote') return await runPreparation(data, input.runId, latest);
  if (input.action === 'remote') {
    const previous = previousRemoteRun(jobsOf(paths.work), input, ledger);
    if (previous !== undefined) return previous;
  }
  const ready = SERVICE_READY.parse(
    JSON.parse(readFileSync(dataLayoutOf(data).system.run.ready, 'utf8')),
  );
  const tools = environment(data, ready.url);
  if (latest !== undefined && releaseNeedsRecovery(latest))
    return {
      status: 'refused',
      refusal: 'busy',
      runId: latest.runId,
      message: `Hub update ${latest.runId} needs an outcome before another can start`,
    };
  if (input.action === 'remote') return admitRemoteSnapshot(tools, input);
  const job = startJob(tools.jobs, 'hub', input, null);
  return await selfUpdateHub({ ...tools, job }, input.notes, origin);
}

async function resultOf(
  data: string,
  input: Command,
  origin: HubUpdateOrigin | undefined,
): Promise<Record<string, unknown>> {
  const paths = selfUpdatePaths(dataLayoutOf(data));
  const previous =
    input.action === 'remote'
      ? previousRemoteRun(jobsOf(paths.work), input, readLedger(paths.ledger))
      : undefined;
  return (
    previous ??
    (await withHubReleaseLock(dataLayoutOf(data), input.action === 'prepare_remote', () =>
      command(data, input, origin),
    ))
  );
}

async function main(): Promise<void> {
  const data = z.string().startsWith('/').parse(process.argv[2]);
  const input = COMMAND.parse(JSON.parse(z.string().parse(process.argv[3])));
  if (
    input.action !== 'hub' &&
    input.action !== 'recover' &&
    input.action !== 'remote' &&
    input.action !== 'prepare_remote'
  )
    throw new Error('Expected a hub update.');
  const heldOrigin = process.argv[4];
  const origin =
    heldOrigin === undefined ? undefined : HUB_UPDATE_ORIGIN.parse(JSON.parse(heldOrigin));
  try {
    const result = await resultOf(data, input, origin);
    process.stdout.write(`${JSON.stringify(result)}\n`);
  } catch (cause) {
    if (!(cause instanceof HubReleaseLockError) || !cause.busy) throw cause;
    process.stderr.write(`${cause.message}\n`);
    process.exitCode = HUB_RELEASE_BUSY_EXIT;
  }
}

if (import.meta.main) await main();
