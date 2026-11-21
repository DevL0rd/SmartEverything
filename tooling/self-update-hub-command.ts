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
import type { HubLayout } from '../apps/hub/src/data-layout/index.ts';
import {
  githubReleaseToken,
  githubRepositoryOf,
  stageGithubRelease,
} from '../apps/hub/src/releases/github-source.ts';
import { releaseStaging, type ReleaseStaging } from '../apps/hub/src/releases/staging.ts';
import { buildSourceOf } from '../apps/hub/src/self-update/build-source.ts';
import { SERVICE_READY } from '../apps/hub/src/service/configuration.ts';
import {
  HUB_RELEASE_BUSY_EXIT,
  HubReleaseLockError,
  releaseNeedsRecovery,
  withHubReleaseLock,
} from '../apps/hub/src/self-update/release-lock.ts';
import { requireBuildDisk } from './build-disk.ts';
import { applyBuildHost, requireBuildHost } from './build-host.ts';
import { measuredBuildScope } from './build-scope.ts';
import {
  HUB_NODE_EXECUTABLE,
  UPDATE_ENTRY_DIRECTORY,
  UPDATE_ENTRY_FILES,
} from './hub-install-layout.ts';
import { assertStandaloneHubUnit } from './release-hub-verify.ts';
import { dataLayoutOf, hubInstall } from './release-hub-files.ts';
import type { StepRequest } from './self-update-commands.ts';
import { runStep } from './self-update-commands.ts';
import { readLedger, selfUpdatePaths } from './self-update-files.ts';
import { localHubBuild } from './self-update-hub-build.ts';
import { hostServiceTarget, stagedHubBuild } from './self-update-hub-stage.ts';
import {
  keepHub,
  recoverHub,
  rollbackHub,
  selfUpdateHub,
  type HubRunTools,
  type HubTools,
} from './self-update-hub.ts';
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
const HUB_ACTIONS: ReadonlySet<string> = new Set<Command['action']>([
  'hub',
  'recover',
  'rollback',
  'keep',
  'remote',
  'prepare_remote',
]);
type HubInput = Extract<UpdateInput, { action: 'hub' }>;
type StagedSource = 'provided' | 'github';
type Command =
  | Extract<UpdateInput, { action: 'hub' | 'recover' | 'rollback' | 'keep' }>
  | z.infer<typeof REMOTE_UPDATE>
  | z.infer<typeof REMOTE_PREPARATION>;

type HubRunEnvironment = Omit<HubRunTools, 'job'>;

function isHubCommand(input: z.infer<typeof COMMAND>): input is Command {
  return HUB_ACTIONS.has(input.action);
}

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

function runEnvironment(data: string, url: string): HubRunEnvironment {
  const install = INSTALL_PATH.parse(env['SMARTEVERYTHING_SELF_UPDATE_INSTALL']);
  assertStandaloneHubUnit(install);
  const layout = dataLayoutOf(data);
  const paths = selfUpdatePaths(layout);
  return {
    data,
    install,
    target: { install: hubInstall(install), data: layout },
    paths,
    node: join(install, HUB_NODE_EXECUTABLE),
    jobs: jobsOf(paths.work),
    now,
    newId: randomUUID,
    url,
    ledger: paths.ledger,
    watchdogLog: paths.watchdogLog,
  };
}

function environment(data: string, url: string): HubEnvironment {
  const root = process.cwd();
  const tools = runEnvironment(data, url);
  const layout = tools.target.data;
  applyBuildHost(layout, root);
  const { node, install } = tools;
  const service = hubInstall(install).service;
  const stepFile = join(service, UPDATE_ENTRY_DIRECTORY, UPDATE_ENTRY_FILES.step);
  const runSteps = (step: StepRequest): ReturnType<typeof runStep> =>
    runStep({ node, stepFile, root }, step, measuredBuildScope('hub', layout));
  return { ...tools, candidate: localHubBuild(layout, root, runSteps, node), runSteps };
}

function readyUrl(data: string): string {
  return SERVICE_READY.parse(JSON.parse(readFileSync(dataLayoutOf(data).system.run.ready, 'utf8')))
    .url;
}

function openRelease(latest: HubUpdateRelease | undefined): Record<string, unknown> | null {
  if (latest === undefined || !releaseNeedsRecovery(latest)) return null;
  return {
    status: 'refused',
    refusal: 'busy',
    runId: latest.runId,
    message: `Hub update ${latest.runId} needs an outcome before another can start`,
  };
}

async function stagedUploadId(
  staging: ReleaseStaging,
  layout: HubLayout,
  input: HubInput,
  source: StagedSource,
): Promise<string> {
  if (source === 'github') {
    const upload = await stageGithubRelease(
      {
        ...(await githubRepositoryOf(layout)),
        staging,
        token: await githubReleaseToken(layout.system.keys),
        fetch,
      },
      { artifact: 'hub', tag: input.tag, commit: input.commit, target: hostServiceTarget() },
    );
    return upload.uploadId;
  }
  if (input.upload === undefined)
    throw new Error('A provided hub release needs the staged upload ID.');
  return input.upload;
}

interface UploadRelease {
  readonly input: HubInput;
  readonly latest: HubUpdateRelease | undefined;
  readonly origin: HubUpdateOrigin | undefined;
  readonly source: StagedSource;
}

async function releaseUpload(
  data: string,
  { input, latest, origin, source }: UploadRelease,
): Promise<Record<string, unknown>> {
  const open = openRelease(latest);
  if (open !== null) return open;
  const tools = runEnvironment(data, readyUrl(data));
  const layout = tools.target.data;
  const staging = releaseStaging(layout, now);
  const upload = await staging.read(await stagedUploadId(staging, layout, input, source));
  if (upload.artifact !== 'hub')
    throw new Error(
      `Upload ${upload.uploadId} is a ${upload.artifact} release, not a hub release.`,
    );
  const candidate = stagedHubBuild({
    release: staging.releaseDirectory(upload),
    keysFile: layout.system.keys.releaseKeys,
    role: source === 'github' ? 'github' : 'machine',
    node: tools.node,
    host: hostServiceTarget(),
  });
  const job = startJob(tools.jobs, 'hub', input, null);
  try {
    const result = await selfUpdateHub({ ...tools, candidate, job }, input.notes, origin);
    if (source === 'github' || result.status === 'started' || result.refusal !== 'busy')
      await staging.discard(upload.uploadId);
    return result;
  } catch (cause) {
    if (source === 'github') await staging.discard(upload.uploadId);
    throw cause;
  }
}

async function releaseStaged(
  data: string,
  input: HubInput,
  latest: HubUpdateRelease | undefined,
  origin: HubUpdateOrigin | undefined,
): Promise<Record<string, unknown> | null> {
  const source = input.source ?? buildSourceOf(dataLayoutOf(data), 'hub');
  if (source === 'hub') return null;
  return await releaseUpload(data, { input, latest, origin, source });
}

function recover(
  data: string,
  input: Extract<Command, { action: 'recover' }>,
  ledger: HubUpdateLedger,
): Record<string, unknown> {
  const release = releaseOf(ledger, input.id);
  if (release === undefined) return { status: 'refused', refusal: 'not_found' };
  if (
    ledger.releases.at(-1)?.runId !== release.runId ||
    !releaseNeedsRecovery(release) ||
    release.phase === 'unrecoverable'
  )
    return { status: 'refused', refusal: 'not_recoverable' };
  if (watchdogRunning(input.id) || remotePreparationRunning(input.id))
    return { status: 'refused', refusal: 'busy' };
  const tools = runEnvironment(data, release.url);
  discardRemotePreparation(tools.paths.work, release.runId);
  const job = startJob(tools.jobs, 'hub', input, null);
  recoverHub({ ...tools, job }, release, input.holdSeconds);
  return { status: 'started', runId: input.id };
}

function rollback(
  data: string,
  input: Extract<Command, { action: 'rollback' }>,
  ledger: HubUpdateLedger,
): Record<string, unknown> {
  if (input.artifact !== 'hub') throw new Error('Expected a hub rollback.');
  const release = releaseOf(ledger, input.id);
  if (release === undefined) return { status: 'refused', refusal: 'not_found' };
  if (
    ledger.releases.at(-1)?.runId !== release.runId ||
    (release.phase !== 'awaiting_decision' && release.phase !== 'unrecoverable')
  )
    return { status: 'refused', refusal: 'not_recoverable' };
  if (watchdogRunning(input.id)) return { status: 'refused', refusal: 'busy' };
  const tools = runEnvironment(data, release.url);
  const job = startJob(tools.jobs, 'hub', input, null);
  rollbackHub({ ...tools, job }, release);
  return { status: 'started', runId: input.id };
}

function keep(
  data: string,
  input: Extract<Command, { action: 'keep' }>,
  ledger: HubUpdateLedger,
): Record<string, unknown> {
  const release = releaseOf(ledger, input.id);
  if (release === undefined) return { status: 'refused', refusal: 'not_found' };
  if (ledger.releases.at(-1)?.runId !== release.runId || release.phase !== 'awaiting_decision')
    return { status: 'refused', refusal: 'not_recoverable' };
  if (watchdogRunning(input.id)) return { status: 'refused', refusal: 'busy' };
  const tools = runEnvironment(data, release.url);
  const job = startJob(tools.jobs, 'hub', input, null);
  keepHub({ ...tools, job }, release);
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

type DecisionCommand = Extract<Command, { action: 'recover' | 'rollback' | 'keep' }>;

function isDecision(input: Command): input is DecisionCommand {
  return input.action === 'recover' || input.action === 'rollback' || input.action === 'keep';
}

function decision(
  data: string,
  input: DecisionCommand,
  ledger: HubUpdateLedger,
): Record<string, unknown> {
  if (input.action === 'recover') return recover(data, input, ledger);
  if (input.action === 'rollback') return rollback(data, input, ledger);
  return keep(data, input, ledger);
}

async function command(
  data: string,
  input: Command,
  origin: HubUpdateOrigin | undefined,
): Promise<Record<string, unknown>> {
  const paths = selfUpdatePaths(dataLayoutOf(data));
  const ledger = readLedger(paths.ledger);
  if (isDecision(input)) return decision(data, input, ledger);
  const latest = ledger.releases.at(-1);
  if (input.action === 'hub') {
    const staged = await releaseStaged(data, input, latest, origin);
    if (staged !== null) return staged;
  }
  requireBuildHost(dataLayoutOf(data), process.cwd(), 'hub');
  requireBuildDisk(dataLayoutOf(data), process.cwd(), 'hub');
  measuredBuildScope('hub', dataLayoutOf(data));
  if (input.action === 'prepare_remote') return await runPreparation(data, input.runId, latest);
  if (input.action === 'remote') {
    const previous = previousRemoteRun(jobsOf(paths.work), input, ledger);
    if (previous !== undefined) return previous;
  }
  const tools = environment(data, readyUrl(data));
  const open = openRelease(latest);
  if (open !== null) return open;
  if (input.action === 'remote') return await admitRemoteSnapshot(tools, input);
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
  if (!isHubCommand(input)) throw new Error('Expected a hub update.');
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
