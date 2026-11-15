import type { DriveRoot, DriveUploadTarget } from '@smarteverything/domain';
import { rawErrorText } from '../../../format/errors';
import type {
  FileLocation,
  UploadHandle,
  UploadJob,
  UploadOutcome,
  UploadTransport,
} from '../../files';
import {
  startUpload,
  uploadEntries,
  type UploadFailure,
  type UploadHandle as TusHandle,
  type UploadOutcome as TusOutcome,
  type UploadRequest,
} from '../upload/transport';
import { folderPlaceOf } from './drive-places';

export interface DriveUploadEnv {
  readonly roots: readonly DriveRoot[];
  readonly viewerId: string | null;
  readonly start: (request: UploadRequest) => TusHandle;
  readonly watch: (id: string, progress: (sent: number) => void) => () => void;
}

export function watchUploadEntry(id: string, progress: (sent: number) => void): () => void {
  return uploadEntries.subscribe(() => {
    const entry = uploadEntries.get().find((candidate) => candidate.id === id);
    if (entry !== undefined) progress(entry.sent);
  });
}

export const LIVE_UPLOAD = { start: startUpload, watch: watchUploadEntry } as const;

const FAILURE_TEXT: Readonly<Record<Exclude<UploadFailure['kind'], 'rejected'>, string>> = {
  'over-quota': 'Your Drive space is full. Free some space or ask the owner for more.',
  'no-space': 'The hub’s disk is full. Nothing was saved.',
  'read-only-root': 'This folder is read-only, so files can’t be added here.',
  'session-refused': 'The hub didn’t accept this device. Sign in again, then try again.',
  'session-expired': 'This upload waited too long and expired. Try again to send it.',
  'hub-unreachable': 'The hub couldn’t be reached. It starts again when the hub is back.',
  'client-error': 'This file couldn’t be read on this device.',
};

const RETRYABLE: ReadonlySet<UploadFailure['kind']> = new Set([
  'hub-unreachable',
  'session-expired',
]);

export const NO_UPLOAD_PLACE = 'Files can’t be added in this place.';

export function failureText(failure: UploadFailure): string {
  return failure.kind === 'rejected' ? failure.message : FAILURE_TEXT[failure.kind];
}

export function uploadTargetOf(
  location: FileLocation,
  roots: readonly DriveRoot[],
  viewerId: string | null,
): DriveUploadTarget | null {
  return folderPlaceOf(location, roots, viewerId);
}

export function uploadOutcomeOf(outcome: TusOutcome): UploadOutcome {
  switch (outcome.kind) {
    case 'done':
      return { kind: 'done', name: outcome.name, renamed: outcome.renamed };
    case 'already-have':
      return { kind: 'have' };
    case 'cancelled':
      return { kind: 'cancelled' };
    case 'failed':
      return {
        kind: 'failed',
        text: failureText(outcome.failure),
        retryable: RETRYABLE.has(outcome.failure.kind),
      };
  }
}

function modifiedOf(source: Blob): number | null {
  return 'lastModified' in source && typeof source.lastModified === 'number'
    ? source.lastModified
    : null;
}

function targetIdOf(target: DriveUploadTarget): string {
  switch (target.kind) {
    case 'drive':
      return target.rootId;
    case 'folder':
      return target.folderId;
    case 'item':
      return target.itemId;
  }
}

export function uploadIdentityOf(
  target: DriveUploadTarget,
  name: string,
  modified: number | null,
): string {
  return ['drive-upload', targetIdOf(target), name, modified === null ? '' : String(modified)].join(
    ':',
  );
}

class RunningUpload {
  private inner: TusHandle | null = null;
  private stopped = false;

  get cancelled(): boolean {
    return this.stopped;
  }

  attach(handle: TusHandle): void {
    this.inner = handle;
  }

  pause(): Promise<void> {
    return this.inner?.pause() ?? Promise.resolve();
  }

  resume(): void {
    this.inner?.resume();
  }

  cancel(): Promise<void> {
    this.stopped = true;
    return this.inner?.cancel() ?? Promise.resolve();
  }
}

async function sendOf(
  job: UploadJob,
  progress: (sent: number) => void,
  env: DriveUploadEnv,
  running: RunningUpload,
): Promise<UploadOutcome> {
  const blob = await job.file.blob();
  if (running.cancelled) return { kind: 'cancelled' };
  const target = uploadTargetOf(job.folder, env.roots, env.viewerId);
  if (target === null) return { kind: 'failed', text: NO_UPLOAD_PLACE, retryable: false };
  const handle = env.start({
    identity: uploadIdentityOf(target, job.name, modifiedOf(blob)),
    source: blob,
    name: job.name,
    target,
  });
  running.attach(handle);
  const release = env.watch(handle.id, progress);
  try {
    return uploadOutcomeOf(await handle.outcome);
  } finally {
    release();
  }
}

export function driveUploadTransport(env: DriveUploadEnv): UploadTransport {
  return {
    conflicts: 'number',
    serial: false,
    start: (job, progress): UploadHandle => {
      const running = new RunningUpload();
      const outcome = sendOf(job, progress, env, running).catch(
        (error: unknown): UploadOutcome => ({
          kind: 'failed',
          text: rawErrorText(error),
          retryable: false,
        }),
      );
      return {
        outcome,
        pause: () => running.pause(),
        resume: (): void => {
          running.resume();
        },
        cancel: () => running.cancel(),
      };
    },
  };
}
