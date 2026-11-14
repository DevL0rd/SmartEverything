import { beforeEach, describe, expect, it } from 'vitest';
import {
  FakeHub,
  FOLDER_ID,
  gate,
  HASH,
  ITEM_ID,
  MemoryStorage,
  payload,
  persistedStorage,
} from './fixtures';
import { fingerprintOf } from './metadata';
import { RESUME_STORAGE_KEY } from './resume-store';
import { createContentReader } from './content-reader';
import { runUpload, type UploadDeps } from './run';
import { uploadEntries } from './store';
import type { UploadRequest } from './types';

const CHUNK = 1000;

function depsOf(hub: FakeHub, memory: MemoryStorage): UploadDeps {
  return { transport: hub, storage: persistedStorage(memory), chunkBytes: CHUNK };
}

function requestOf(
  size: number,
  extra: Partial<Omit<UploadRequest, 'source'>> = {},
): UploadRequest & { readonly source: Blob } {
  return {
    identity: 'asset-1:1700000000',
    source: payload(size),
    name: 'photo.jpg',
    target: { kind: 'folder', folderId: FOLDER_ID },
    ...extra,
  };
}

async function bytesOf(source: Blob): Promise<Uint8Array> {
  return new Uint8Array(await source.arrayBuffer());
}

describe('resumable upload', () => {
  let hub: FakeHub;
  let memory: MemoryStorage;

  beforeEach(() => {
    hub = new FakeHub();
    memory = new MemoryStorage();
    uploadEntries.set([]);
  });

  it('creates one session, sends every chunk and clears the resume record', async () => {
    const request = requestOf(2500);
    const handle = runUpload(request, depsOf(hub, memory));
    expect(await handle.outcome).toEqual({
      kind: 'done',
      itemId: ITEM_ID,
      name: 'photo.jpg',
      renamed: false,
    });
    expect(hub.count('POST')).toBe(1);
    expect(hub.count('PATCH')).toBe(3);
    expect(hub.bytesOf('/drive/uploads/session-1')).toEqual(await bytesOf(request.source));
    expect(JSON.parse(memory.values.get(RESUME_STORAGE_KEY) ?? '{}')).toEqual({});
    expect(uploadEntries.get()).toMatchObject([{ state: 'settled', sent: 2500, size: 2500 }]);
  });

  it('resumes from the hub offset after the app is killed mid-chunk', async () => {
    const request = requestOf(2500);
    hub.dieAfterBytes = 400;
    const first = await runUpload(request, depsOf(hub, memory)).outcome;
    expect(first).toMatchObject({ kind: 'failed', failure: { kind: 'hub-unreachable' } });
    expect(hub.sessions.get('/drive/uploads/session-1')?.offset).toBe(400);
    const second = await runUpload(request, depsOf(hub, memory)).outcome;
    expect(second).toMatchObject({ kind: 'done', itemId: ITEM_ID });
    expect(hub.count('POST')).toBe(1);
    expect(hub.count('HEAD')).toBe(1);
    expect(hub.bytesOf('/drive/uploads/session-1')).toEqual(await bytesOf(request.source));
  });

  it('creates a new session when the stored one has expired on the hub', async () => {
    const request = requestOf(1500);
    hub.dieAfterBytes = 300;
    await runUpload(request, depsOf(hub, memory)).outcome;
    hub.sessions.clear();
    const outcome = await runUpload(request, depsOf(hub, memory)).outcome;
    expect(outcome).toMatchObject({ kind: 'done' });
    expect(hub.count('POST')).toBe(2);
    expect(hub.bytesOf('/drive/uploads/session-2')).toEqual(await bytesOf(request.source));
  });

  it('names a clash renamed by the hub', async () => {
    hub.storedName = 'photo (2).jpg';
    const outcome = await runUpload(requestOf(500), depsOf(hub, memory)).outcome;
    expect(outcome).toEqual({
      kind: 'done',
      itemId: ITEM_ID,
      name: 'photo (2).jpg',
      renamed: true,
    });
  });

  it('cancels with a DELETE and forgets the session', async () => {
    const blocked = gate();
    hub.beforeWrite = (): Promise<void> => blocked.passed;
    const handle = runUpload(requestOf(2500), depsOf(hub, memory));
    await expect.poll(() => hub.count('PATCH')).toBe(1);
    const cancelled = handle.cancel();
    blocked.open();
    await cancelled;
    expect(await handle.outcome).toEqual({ kind: 'cancelled' });
    expect(hub.count('DELETE')).toBe(1);
    expect(hub.sessions.size).toBe(0);
    expect(JSON.parse(memory.values.get(RESUME_STORAGE_KEY) ?? '{}')).toEqual({});
  });

  it('pauses without ending the session and continues from the same offset', async () => {
    const blocked = gate();
    hub.beforeWrite = (): Promise<void> => blocked.passed;
    const request = requestOf(2500);
    const handle = runUpload(request, depsOf(hub, memory));
    await expect.poll(() => hub.count('PATCH')).toBe(1);
    await handle.pause();
    expect(uploadEntries.get()).toMatchObject([{ state: 'paused' }]);
    hub.beforeWrite = null;
    blocked.open();
    handle.resume();
    expect(await handle.outcome).toMatchObject({ kind: 'done' });
    expect(hub.count('POST')).toBe(1);
    expect(hub.bytesOf('/drive/uploads/session-1')).toEqual(await bytesOf(request.source));
  });

  it('sends the target, name and hash in the upload metadata', async () => {
    const target = { kind: 'item', itemId: ITEM_ID, baseRev: 4 } as const;
    await runUpload(requestOf(100, { target, sha256: HASH }), depsOf(hub, memory)).outcome;
    const header = hub.sessions.get('/drive/uploads/session-1')?.metadata ?? '';
    const decoded = Object.fromEntries(
      header.split(',').map((pair) => {
        const [key = '', value = ''] = pair.split(' ');
        return [key, Buffer.from(value, 'base64').toString('utf8')];
      }),
    );
    expect(decoded).toEqual({
      filename: 'photo.jpg',
      filetype: 'image/jpeg',
      targetKind: 'item',
      itemId: ITEM_ID,
      baseRev: '4',
      sha256: HASH,
    });
  });

  it('streams a sized content URI with the existing resumable protocol and closes the reader', async () => {
    const source = { uri: 'content://media/external/video/media/1', size: 2500, type: 'video/mp4' };
    const reads: number[][] = [];
    const reader = createContentReader(
      source,
      (start, bytes) => {
        reads.push([start, bytes]);
        return Promise.resolve(payload(bytes));
      },
      CHUNK,
    );
    let closes = 0;
    const handle = runUpload(
      {
        identity: 'video-1',
        source,
        name: 'video.mp4',
        target: { kind: 'folder', folderId: FOLDER_ID },
      },
      {
        ...depsOf(hub, memory),
        input: reader.input,
        fileReader: reader.fileReader,
        closeReader: () => {
          closes += 1;
          return reader.close();
        },
      },
    );
    expect(await handle.outcome).toMatchObject({ kind: 'done' });
    expect(reads).toEqual([
      [0, 1000],
      [1000, 1000],
      [2000, 500],
    ]);
    expect(closes).toBe(1);
    expect(hub.count('POST')).toBe(1);
    expect(hub.count('PATCH')).toBe(3);
  });

  it('pauses a native range read, waits for cleanup and resumes through the same tus session', async () => {
    const source = { uri: 'content://media/external/video/media/2', size: 1000, type: 'video/mp4' };
    let reads = 0;
    let cleaned = false;
    const reader = createContentReader(
      source,
      (_start, bytes, signal) => {
        reads += 1;
        if (reads > 1) return Promise.resolve(payload(bytes));
        return new Promise<Blob>((_resolve, reject) => {
          signal.addEventListener(
            'abort',
            () => {
              cleaned = true;
              reject(new Error('Read aborted'));
            },
            { once: true },
          );
        });
      },
      CHUNK,
    );
    const handle = runUpload(
      {
        identity: 'video-2',
        source,
        name: 'video.mp4',
        target: { kind: 'folder', folderId: FOLDER_ID },
      },
      {
        ...depsOf(hub, memory),
        input: reader.input,
        fileReader: reader.fileReader,
        closeReader: reader.close,
      },
    );
    await expect.poll(() => reads).toBe(1);
    await handle.pause();
    expect(cleaned).toBe(true);
    expect(uploadEntries.get()).toMatchObject([{ state: 'paused' }]);
    handle.resume();
    expect(await handle.outcome).toMatchObject({ kind: 'done' });
    expect(hub.count('POST')).toBe(1);
    expect(hub.count('HEAD')).toBe(1);
  });

  it('rejects a malformed request before touching the hub', () => {
    expect(() => runUpload(requestOf(10, { name: '' }), depsOf(hub, memory))).toThrow();
    expect(hub.exchanges).toEqual([]);
  });
});

it('never resumes a previous receipt for different expected content of the same size', () => {
  const first = requestOf(10, { sha256: 'ab'.repeat(32) });
  const changed = requestOf(10, { sha256: 'cd'.repeat(32) });
  expect(fingerprintOf(first)).not.toBe(fingerprintOf(changed));
  expect(fingerprintOf(requestOf(10))).toBe(`asset-1:1700000000|10|folder:${FOLDER_ID}`);
});
