import { existsSync, mkdtempSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { isAbsolute, join } from 'node:path';
import {
  HUB_UPDATE_SOURCE_SAVE,
  HUB_UPDATE_SOURCE_SAVED,
  SELF_UPDATE_ROOT,
  type HubUpdateSourceSave,
  type HubUpdateSourceSaved,
  type HubUpdateSourceStart,
} from '@smarteverything/domain';
import { z } from 'zod';
import {
  HubReleaseLockError,
  withIdleHubRelease,
} from '../apps/hub/src/self-update/release-lock.ts';
import { pendingFiles } from './hub-update-candidate.ts';
import { reviewedHubSourceOffer } from './hub-update-offer.ts';
import { savePendingTrees } from './hub-update-save-trees.ts';
import { dataLayoutOf } from './release-hub-files.ts';
import {
  branchRef,
  gitSource,
  gitSourceText,
  HubSourceError,
  readSourceHead,
} from './hub-update-source.ts';

const SAVED_REQUEST = HUB_UPDATE_SOURCE_SAVE.extend({ ownerClient: z.uuid() });
const RECEIPT = z.strictObject({
  request: SAVED_REQUEST,
  saved: HUB_UPDATE_SOURCE_SAVED,
  finished: z.boolean(),
  pending: z.string().regex(/^[a-f0-9]{64}$/u),
});
type SaveReceipt = z.infer<typeof RECEIPT>;
type SaveRequest = z.infer<typeof SAVED_REQUEST>;
type ReviewedOffer = ReturnType<typeof reviewedHubSourceOffer>;

async function checkSource(
  reviewed: ReviewedOffer,
): Promise<Awaited<ReturnType<typeof pendingFiles>>> {
  const { source, head } = reviewed.offer;
  const branch = await gitSource(source.folder, ['symbolic-ref', 'HEAD']);
  if (
    branch.code !== 0 ||
    branch.text.trim() !== branchRef(source) ||
    (await readSourceHead(source)) !== head
  )
    throw new HubSourceError('changed', 'The checked-out branch changed. Check for updates again.');
  const unmerged = await gitSourceText(
    source.folder,
    ['ls-files', '--unmerged', '-z'],
    'check for conflicts',
  );
  if (unmerged.length > 0)
    throw new HubSourceError('conflict', 'Resolve Git conflicts before saving pending work.');
  const pending = await pendingFiles(source.folder);
  if (pending.identity !== reviewed.pending)
    throw new HubSourceError('changed', 'Pending files changed. Check for updates again.');
  if (pending.staged.length === 0 && pending.patch.length === 0 && pending.untracked.size === 0)
    throw new HubSourceError('pending', 'There are no pending files to save.');
  return pending;
}

async function branchValue(folder: string, ref: string): Promise<string | undefined> {
  const result = await gitSource(folder, ['rev-parse', '--verify', '--quiet', ref]);
  if (result.code === 1) return undefined;
  if (result.code !== 0)
    throw new HubSourceError('git', 'Git could not check the recovery branch.');
  return result.text.trim();
}

function receiptFile(data: string, requestId: string): string {
  return join(data, SELF_UPDATE_ROOT, `source-save-${z.uuid().parse(requestId)}.json`);
}

function readReceipt(file: string): SaveReceipt | undefined {
  return existsSync(file) ? RECEIPT.parse(JSON.parse(readFileSync(file, 'utf8'))) : undefined;
}

export function verifiedSavedPending(
  data: string,
  ownerClient: string,
  request: HubUpdateSourceStart,
  reviewed: ReviewedOffer,
): HubUpdateSourceSaved | undefined {
  if (request.savedRequestId === undefined) return undefined;
  const receipt = readReceipt(receiptFile(data, request.savedRequestId));
  if (
    receipt?.finished !== true ||
    receipt.request.ownerClient !== ownerClient ||
    receipt.request.offerId !== reviewed.offerId ||
    receipt.pending !== reviewed.pending
  )
    throw new HubSourceError('pending', 'Save the exact reviewed pending files before releasing.');
  return receipt.saved;
}

export async function assertSavedBranch(
  folder: string,
  saved: HubUpdateSourceSaved,
): Promise<void> {
  if ((await branchValue(folder, `refs/heads/${saved.branch}`)) !== saved.commit)
    throw new HubSourceError('changed', 'The saved recovery branch was changed or removed.');
}

function previousSave(file: string, request: SaveRequest): SaveReceipt | undefined {
  const receipt = readReceipt(file);
  if (receipt === undefined) return undefined;
  const { request: previous } = receipt;
  if (
    previous.offerId !== request.offerId ||
    previous.ownerClient !== request.ownerClient ||
    previous.branch !== request.branch
  )
    throw new HubSourceError('changed', 'This request ID belongs to another recovery branch.');
  return receipt;
}

function recordSave(file: string, receipt: SaveReceipt): void {
  const temporary = `${file}.next`;
  try {
    writeFileSync(temporary, JSON.stringify(RECEIPT.parse(receipt)), { mode: 0o600 });
    renameSync(temporary, file);
  } finally {
    rmSync(temporary, { force: true });
  }
}

async function prepareSave(
  workspace: string,
  file: string,
  request: SaveRequest,
  reviewed: ReviewedOffer,
): Promise<HubUpdateSourceSaved> {
  const { source, head } = reviewed.offer;
  const pending = await checkSource(reviewed);
  const scratch = mkdtempSync(join(workspace, 'source-save-'));
  try {
    const commit = await savePendingTrees(source.folder, scratch, head, pending);
    await checkSource(reviewed);
    const saved = { branch: request.branch, commit };
    recordSave(file, { request, saved, finished: false, pending: reviewed.pending });
    return saved;
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

async function existingRecovery(
  folder: string,
  ref: string,
  previous: SaveReceipt | undefined,
): Promise<SaveReceipt | undefined> {
  const actual = await branchValue(folder, ref);
  if (previous !== undefined && actual === previous.saved.commit) return previous;
  if (previous?.finished === true)
    throw new HubSourceError('changed', 'The saved recovery branch was changed or removed.');
  if (actual !== undefined)
    throw new HubSourceError('branch', 'A branch with this name already exists.');
  return undefined;
}

async function saveUnderLock(data: string, request: SaveRequest): Promise<HubUpdateSourceSaved> {
  const reviewed = reviewedHubSourceOffer(data, request.ownerClient, request.offerId);
  const { folder } = reviewed.offer.source;
  const ref = `refs/heads/${request.branch}`;
  await gitSourceText(folder, ['check-ref-format', ref], 'validate the recovery branch name');
  const workspace = join(data, SELF_UPDATE_ROOT);
  const file = receiptFile(data, request.requestId);
  const previous = previousSave(file, request);
  const existing = await existingRecovery(folder, ref, previous);
  if (existing !== undefined) {
    if (!existing.finished) recordSave(file, { ...existing, finished: true });
    return existing.saved;
  }
  const saved = previous?.saved ?? (await prepareSave(workspace, file, request, reviewed));
  if (previous !== undefined) await checkSource(reviewed);
  const created = await gitSource(
    folder,
    ['update-ref', '--stdin'],
    `create ${ref} ${saved.commit}\n`,
  );
  if (created.code !== 0)
    throw new HubSourceError('branch', 'Git could not create the recovery branch. Check the name.');
  recordSave(file, { request, saved, finished: true, pending: reviewed.pending });
  return saved;
}

export function saveReviewedPending(
  data: string,
  ownerClient: string,
  input: HubUpdateSourceSave,
): Promise<HubUpdateSourceSaved> {
  const request = SAVED_REQUEST.parse({ ...input, ownerClient });
  return withIdleHubRelease(dataLayoutOf(data), () => saveUnderLock(data, request));
}

if (import.meta.main) {
  const data = z.string().refine(isAbsolute).parse(process.argv[2]);
  const request = SAVED_REQUEST.parse(JSON.parse(z.string().parse(process.argv[3])));
  try {
    const { ownerClient, ...input } = request;
    const saved = await saveReviewedPending(data, ownerClient, input);
    process.stdout.write(`${JSON.stringify(saved)}\n`);
  } catch (cause) {
    if (!(cause instanceof HubSourceError) && !(cause instanceof HubReleaseLockError)) throw cause;
    process.stdout.write(`${JSON.stringify({ error: cause.message })}\n`);
  }
}
