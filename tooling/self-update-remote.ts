import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import {
  HUB_UPDATE_SOURCE_START,
  HUB_UPDATE_BOOT_RECEIPT,
  HUB_UPDATE_BOOT_RECEIPT_FILE,
  releaseOf,
  type HubUpdateAcceptance,
  type HubUpdateLedger,
  type HubUpdateRelease,
} from '@smarteverything/domain';
import { z } from 'zod';
import { hubPendingIdentity, prepareHubUpdateCandidate } from './hub-update-candidate.ts';
import { REVIEWED_OFFER, reviewedHubSourceOffer } from './hub-update-offer.ts';
import { assertSavedBranch, verifiedSavedPending } from './hub-update-save-command.ts';
import { HubSourceError, readSourceHead } from './hub-update-source.ts';
import { candidateIdentity } from './self-update-candidate-identity.ts';
import type { StepOutcome, StepRequest } from './self-update-commands.ts';
import { readLedger } from './self-update-ledger.ts';
import { approvedRemoteHubBuild } from './self-update-hub-build.ts';
import {
  failHubPreparation,
  outcomeMessage,
  prepareReservedHubUpdate,
  reserveHubUpdate,
  type HubTools,
} from './self-update-hub.ts';
import { changeJob, readJob, startJob, type JobStore, type UpdateJob } from './self-update-job.ts';
import { startRemotePreparation } from './self-update-remote-start.ts';

export const REMOTE_UPDATE = HUB_UPDATE_SOURCE_START.safeExtend({
  action: z.literal('remote'),
  ownerClient: z.uuid(),
});

export const REMOTE_PREPARATION = z.strictObject({
  action: z.literal('prepare_remote'),
  runId: z.uuid(),
});

const RESERVED_REQUEST = z.strictObject({ request: REMOTE_UPDATE, reviewed: REVIEWED_OFFER });
const REFUSAL = z.enum(['identity_same', 'failed']);

type RemoteUpdate = z.infer<typeof REMOTE_UPDATE>;

interface RemoteTools extends Omit<HubTools, 'job'> {
  readonly runSteps: (step: StepRequest) => StepOutcome;
}

function refused(input: RemoteUpdate, message: string): HubUpdateAcceptance {
  return { status: 'refused', refusal: 'failed', runId: input.requestId, message };
}

function sameRequest(job: UpdateJob, input: RemoteUpdate): boolean {
  const saved = RESERVED_REQUEST.safeParse(job.input);
  return (
    saved.success &&
    saved.data.request.ownerClient === input.ownerClient &&
    saved.data.request.offerId === input.offerId &&
    saved.data.request.includePending === input.includePending &&
    saved.data.request.savedRequestId === input.savedRequestId
  );
}

function persistedOutcome(job: UpdateJob, release: HubUpdateRelease): HubUpdateAcceptance {
  if (job.phase !== 'failed' && release.phase !== 'failed')
    return { status: 'started', runId: release.runId };
  const result = REFUSAL.safeParse(job.result['refusal']);
  return {
    status: 'refused',
    refusal: result.success ? result.data : 'failed',
    runId: release.runId,
    message: job.phase === 'failed' && job.detail !== null ? job.detail : outcomeMessage(release),
  };
}

export function previousRemoteRun(
  jobs: JobStore,
  input: RemoteUpdate,
  ledger: HubUpdateLedger,
): HubUpdateAcceptance | undefined {
  const release = ledger.releases.find(({ runId }) => runId === input.requestId);
  const job = readJob(jobs, input.requestId);
  if (release === undefined && job === null) return undefined;
  if (job === null || !sameRequest(job, input))
    return refused(input, 'This request ID belongs to another update. Check for updates again.');
  return release === undefined ? undefined : persistedOutcome(job, release);
}

function installedRemoteTip(tools: RemoteTools): string | undefined {
  const file = join(tools.target.install.service, HUB_UPDATE_BOOT_RECEIPT_FILE);
  if (!existsSync(file)) return undefined;
  const { runId } = HUB_UPDATE_BOOT_RECEIPT.parse(JSON.parse(readFileSync(file, 'utf8')));
  return releaseOf(readLedger(tools.ledger), runId)?.remoteTip;
}

export function admitRemoteSnapshot(tools: RemoteTools, input: RemoteUpdate): HubUpdateAcceptance {
  let reviewed: z.infer<typeof REVIEWED_OFFER>;
  try {
    reviewed = reviewedHubSourceOffer(tools.data, input.ownerClient, input.offerId);
    if (reviewed.offer.tip === installedRemoteTip(tools))
      return {
        status: 'refused',
        refusal: 'identity_same',
        runId: input.requestId,
        message: 'This remote snapshot is already running.',
      };
    verifiedSavedPending(tools.data, input.ownerClient, input, reviewed);
  } catch (cause) {
    if (cause instanceof HubSourceError) return refused(input, cause.message);
    throw cause;
  }
  const newId = (): string => input.requestId;
  const job = startJob({ ...tools.jobs, newId }, 'hub', { request: input, reviewed }, null);
  const { tip } = reviewed.offer;
  const release = reserveHubUpdate(
    { ...tools, newId },
    { notes: `Remote source snapshot ${tip}`, remoteTip: tip },
  );
  try {
    startRemotePreparation(tools.data, tools.install, release.runId);
    return { status: 'started', runId: release.runId };
  } catch (cause) {
    return failHubPreparation({ ...tools, job }, release, cause);
  }
}

async function candidateFor(
  tools: RemoteTools,
  root: string,
  reviewed: z.infer<typeof REVIEWED_OFFER>,
): Promise<{ readonly identity: string; readonly candidate: HubTools['candidate'] }> {
  const { tip, source } = reviewed.offer;
  const identity = await candidateIdentity(root);
  return {
    identity,
    candidate: approvedRemoteHubBuild(
      {
        source: source.folder,
        root,
        installedService: tools.target.install.service,
        tip,
        identity,
      },
      tools.paths.work,
      tools.runSteps,
    ),
  };
}

function preparationWorkspace(work: string, runId: string): string {
  return join(work, `${z.uuid().parse(runId)}-preparation`);
}

export function discardRemotePreparation(work: string, runId: string): void {
  rmSync(preparationWorkspace(work, runId), { recursive: true, force: true });
}

function protectSavedBackup(
  build: Awaited<ReturnType<typeof candidateFor>>,
  reviewed: z.infer<typeof REVIEWED_OFFER>,
  checkSaved: () => Promise<void>,
): Awaited<ReturnType<typeof candidateFor>> {
  return {
    ...build,
    candidate: {
      ...build.candidate,
      checkMigrations: async (layout): ReturnType<HubTools['candidate']['checkMigrations']> => {
        const result = await build.candidate.checkMigrations(layout);
        const { head, source } = reviewed.offer;
        if (
          (await readSourceHead(source)) !== head ||
          (await hubPendingIdentity(source.folder)) !== reviewed.pending
        )
          throw new HubSourceError('changed', 'Pending files changed. Check for updates again.');
        await checkSaved();
        return result;
      },
    },
  };
}

async function prepareCandidate(
  tools: RemoteTools,
  job: UpdateJob,
  reservation: HubUpdateRelease,
): Promise<Awaited<ReturnType<typeof candidateFor>> | undefined> {
  try {
    const { request, reviewed } = RESERVED_REQUEST.parse(job.input);
    const workspace = preparationWorkspace(tools.paths.work, reservation.runId);
    mkdirSync(workspace, { mode: 0o700 });
    const saved = verifiedSavedPending(tools.data, request.ownerClient, request, reviewed);
    const checkSaved =
      saved === undefined
        ? undefined
        : (): Promise<void> => assertSavedBranch(reviewed.offer.source.folder, saved);
    const root = await prepareHubUpdateCandidate(
      reviewed.offer,
      workspace,
      request.includePending,
      checkSaved === undefined ? reviewed.pending : { identity: reviewed.pending, checkSaved },
    );
    const build = await candidateFor(tools, root, reviewed);
    return checkSaved === undefined ? build : protectSavedBackup(build, reviewed, checkSaved);
  } catch (cause) {
    failHubPreparation({ ...tools, job }, reservation, cause);
    return undefined;
  }
}

export async function prepareRemoteSnapshot(
  tools: RemoteTools,
  reservation: HubUpdateRelease,
): Promise<void> {
  const job = readJob(tools.jobs, reservation.runId);
  if (job === null) throw new Error('The reserved hub update has no saved request.');
  try {
    const build = await prepareCandidate(tools, job, reservation);
    if (build === undefined) return;
    const identified = changeJob(tools.jobs, job, { identity: build.identity, phase: 'running' });
    await prepareReservedHubUpdate(
      { ...tools, candidate: build.candidate, job: identified },
      reservation,
    );
  } finally {
    discardRemotePreparation(tools.paths.work, reservation.runId);
  }
}
