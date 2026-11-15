import { describe, expect, it } from 'vitest';
import type { PickedBlob } from '../../../platform/pick-files';
import type { UploadJob } from '../../files';
import type { UploadOutcome, UploadRequest } from '../upload/transport';
import { ROOT_ID } from '../data/fixtures';
import { DRIVE_PLACES } from './drive-places';
import { MINE, VIEWER_ID, idOf } from './drive-fixture';
import {
  driveUploadTransport,
  failureText,
  uploadIdentityOf,
  uploadOutcomeOf,
  uploadTargetOf,
  type DriveUploadEnv,
} from './drive-upload';

function pickedOf(name: string): PickedBlob {
  const blob = new Blob(['hello']);
  return {
    name,
    mime: 'text/plain',
    bytes: 5,
    preview: null,
    data: () => blob.arrayBuffer(),
    blob: () => Promise.resolve(blob),
  };
}

function jobOf(folder: UploadJob['folder'], name = 'a.txt'): UploadJob {
  return { id: '1', file: pickedOf(name), folder, name, replace: false };
}

interface Rig {
  readonly env: DriveUploadEnv;
  readonly requests: UploadRequest[];
  readonly finish: (outcome: UploadOutcome) => void;
  readonly progress: { current: ((sent: number) => void) | null };
  readonly log: string[];
}

function rig(): Rig {
  const requests: UploadRequest[] = [];
  const log: string[] = [];
  const progress: Rig['progress'] = { current: null };
  let settle: (outcome: UploadOutcome) => void = () => undefined;
  const env: DriveUploadEnv = {
    roots: [MINE],
    viewerId: VIEWER_ID,
    start: (request) => {
      requests.push(request);
      return {
        id: 'handle-1',
        outcome: new Promise((resolve) => {
          settle = resolve;
        }),
        pause: (): Promise<void> => {
          log.push('pause');
          return Promise.resolve();
        },
        resume: (): void => {
          log.push('resume');
        },
        cancel: (): Promise<void> => {
          log.push('cancel');
          return Promise.resolve();
        },
      };
    },
    watch: (id, report) => {
      progress.current = report;
      log.push(`watch ${id}`);
      return () => {
        log.push('release');
      };
    },
  };
  return {
    env,
    requests,
    finish: (outcome): void => {
      settle(outcome);
    },
    progress,
    log,
  };
}

describe('upload targets', () => {
  it('uploads into a folder or to the top of a drive', () => {
    expect(
      uploadTargetOf({ place: DRIVE_PLACES.myDrive, folder: idOf(1) }, [MINE], VIEWER_ID),
    ).toEqual({
      kind: 'folder',
      folderId: idOf(1),
    });
    expect(
      uploadTargetOf({ place: DRIVE_PLACES.myDrive, folder: null }, [MINE], VIEWER_ID),
    ).toEqual({
      kind: 'drive',
      rootId: ROOT_ID,
    });
  });

  it('has no target in the trash or at the top of Shared with me', () => {
    expect(
      uploadTargetOf({ place: DRIVE_PLACES.trash, folder: null }, [MINE], VIEWER_ID),
    ).toBeNull();
    expect(
      uploadTargetOf({ place: DRIVE_PLACES.sharedWithMe, folder: null }, [MINE], VIEWER_ID),
    ).toBeNull();
  });

  it('keys a resume by target, name and modified time', () => {
    expect(uploadIdentityOf({ kind: 'folder', folderId: idOf(1) }, 'a.txt', 42)).toBe(
      `drive-upload:${idOf(1)}:a.txt:42`,
    );
    expect(uploadIdentityOf({ kind: 'drive', rootId: ROOT_ID }, 'a.txt', null)).toBe(
      `drive-upload:${ROOT_ID}:a.txt:`,
    );
  });
});

describe('upload outcomes', () => {
  it('maps every tus outcome', () => {
    expect(
      uploadOutcomeOf({ kind: 'done', itemId: idOf(1), name: 'a (2).txt', renamed: true }),
    ).toEqual({
      kind: 'done',
      name: 'a (2).txt',
      renamed: true,
    });
    expect(uploadOutcomeOf({ kind: 'already-have', itemId: idOf(1) })).toEqual({ kind: 'have' });
    expect(uploadOutcomeOf({ kind: 'cancelled' })).toEqual({ kind: 'cancelled' });
    expect(uploadOutcomeOf({ kind: 'failed', failure: { kind: 'over-quota' } })).toEqual({
      kind: 'failed',
      text: failureText({ kind: 'over-quota' }),
      retryable: false,
    });
    expect(
      uploadOutcomeOf({ kind: 'failed', failure: { kind: 'hub-unreachable', reason: 'x' } }),
    ).toMatchObject({
      retryable: true,
    });
    expect(
      uploadOutcomeOf({
        kind: 'failed',
        failure: { kind: 'rejected', status: 400, message: 'No.' },
      }),
    ).toMatchObject({
      text: 'No.',
      retryable: false,
    });
  });
});

describe('the Drive upload transport', () => {
  it('numbers clashes itself and sends many files at once', () => {
    const transport = driveUploadTransport(rig().env);
    expect(transport).toMatchObject({ conflicts: 'number', serial: false });
  });

  it('starts the tus upload for the folder, reports progress and settles', async () => {
    const { env, requests, finish, progress, log } = rig();
    const handle = driveUploadTransport(env).start(
      jobOf({ place: DRIVE_PLACES.myDrive, folder: idOf(1) }),
      () => undefined,
    );
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(requests).toHaveLength(1);
    expect(requests[0]).toMatchObject({
      name: 'a.txt',
      target: { kind: 'folder', folderId: idOf(1) },
    });
    expect(progress.current).not.toBeNull();
    finish({ kind: 'done', itemId: idOf(9), name: 'a.txt', renamed: false });
    expect(await handle.outcome).toEqual({ kind: 'done', name: 'a.txt', renamed: false });
    expect(log).toEqual(['watch handle-1', 'release']);
  });

  it('passes pause, resume and cancel to the running upload', async () => {
    const { env, log } = rig();
    const handle = driveUploadTransport(env).start(
      jobOf({ place: DRIVE_PLACES.myDrive, folder: idOf(1) }),
      () => undefined,
    );
    await new Promise((resolve) => setTimeout(resolve, 0));
    await handle.pause();
    handle.resume();
    await handle.cancel();
    expect(log).toEqual(['watch handle-1', 'pause', 'resume', 'cancel']);
  });

  it('fails an upload into a place with no target without starting anything', async () => {
    const { env, requests } = rig();
    const handle = driveUploadTransport(env).start(
      jobOf({ place: DRIVE_PLACES.trash, folder: null }),
      () => undefined,
    );
    expect(await handle.outcome).toMatchObject({ kind: 'failed', retryable: false });
    expect(requests).toEqual([]);
  });

  it('cancels an upload that has not started reading', async () => {
    const { env, requests } = rig();
    const handle = driveUploadTransport(env).start(
      jobOf({ place: DRIVE_PLACES.myDrive, folder: idOf(1) }),
      () => undefined,
    );
    await handle.cancel();
    expect(await handle.outcome).toEqual({ kind: 'cancelled' });
    expect(requests).toEqual([]);
  });
});
