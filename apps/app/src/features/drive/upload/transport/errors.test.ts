import { beforeEach, describe, expect, it } from 'vitest';
import { FakeHub, FOLDER_ID, ITEM_ID, MemoryStorage, payload, persistedStorage } from './fixtures';
import { ITEM_ID_HEADER } from './errors';
import { runUpload } from './run';
import { uploadEntries } from './store';
import type { UploadFailure, UploadOutcome } from './types';

async function attempt(hub: FakeHub): Promise<UploadOutcome> {
  return runUpload(
    {
      identity: 'asset-2',
      source: payload(2000),
      name: 'clip.mp4',
      target: { kind: 'folder', folderId: FOLDER_ID },
    },
    { transport: hub, storage: persistedStorage(new MemoryStorage()), chunkBytes: 1000 },
  ).outcome;
}

const SIMPLE: Readonly<Record<string, UploadFailure>> = {
  'over-quota': { kind: 'over-quota' },
  'no-space': { kind: 'no-space' },
  'read-only-root': { kind: 'read-only-root' },
  'session-refused': { kind: 'session-refused' },
  'session-expired': { kind: 'session-expired' },
};

function failure(kind: keyof typeof SIMPLE): UploadOutcome {
  const known = SIMPLE[kind];
  if (known === undefined) throw new Error(`unknown failure ${kind}`);
  return { kind: 'failed', failure: known };
}

describe('upload errors', () => {
  let hub: FakeHub;

  beforeEach(() => {
    hub = new FakeHub();
    uploadEntries.set([]);
  });

  it.each([
    ['over_quota', 413, 'over-quota'],
    ['no_space', 507, 'no-space'],
    ['read_only_root', 403, 'read-only-root'],
  ] as const)('maps the %s refusal when creating the session', async (reason, status, kind) => {
    hub.refuseCreate = { status, reason };
    expect(await attempt(hub)).toEqual(failure(kind));
  });

  it('maps a refused token to a refused session', async () => {
    hub.refuseCreate = { status: 401 };
    expect(await attempt(hub)).toEqual(failure('session-refused'));
  });

  it('maps a session that vanished mid-upload to an expired session', async () => {
    hub.refuseWrite = { status: 404 };
    expect(await attempt(hub)).toEqual(failure('session-expired'));
  });

  it('maps no space during a chunk to no space', async () => {
    hub.refuseWrite = { status: 507, reason: 'no_space' };
    expect(await attempt(hub)).toEqual(failure('no-space'));
  });

  it('reports the hub already has the file with its item', async () => {
    hub.refuseCreate = {
      status: 409,
      reason: 'already_have',
      headers: { 'upload-item-id': ITEM_ID },
    };
    expect(await attempt(hub)).toEqual({ kind: 'already-have', itemId: ITEM_ID });
    expect(ITEM_ID_HEADER).toBe('Upload-Item-Id');
  });

  it('keeps the hub message for an unknown refusal', async () => {
    hub.refuseCreate = { status: 422, reason: 'something_new' };
    expect(await attempt(hub)).toEqual({
      kind: 'failed',
      failure: { kind: 'rejected', status: 422, message: 'Refused.' },
    });
  });

  it('reports an unreachable hub', async () => {
    hub.dieAfterBytes = 0;
    expect(await attempt(hub)).toMatchObject({
      kind: 'failed',
      failure: { kind: 'hub-unreachable', reason: 'Network request failed' },
    });
  });
});
