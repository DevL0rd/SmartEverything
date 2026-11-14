import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PickedBlob } from '../../../platform/pick-files';
import type { UploadHandle, UploadOutcome, UploadRequest } from './transport';

vi.mock('./transport/client', () => ({ startUpload: vi.fn() }));

import { addUploadEntry, patchUploadEntry, uploadEntries } from './transport';
import {
  EMPTY_UPLOADS,
  cancelUpload,
  clearFolder,
  driveUploads,
  pauseFolder,
  pauseUpload,
  resumeUpload,
  retryFolderId,
  uploadFiles,
  type DriveUploadDeps,
} from './drive-uploads';
import { headlineOf, rowsOf, summaryOf, type UploadRow } from './upload-model';

const FOLDER = '00000000-0000-4000-8000-0000000000f1';
const IN_FOLDER = { kind: 'folder', folderId: FOLDER } as const;
const ROOT = '00000000-0000-4000-8000-0000000000a1';
const OTHER = '00000000-0000-4000-8000-0000000000f2';

function picked(name: string, bytes: number): PickedBlob {
  const blob = new Blob([new Uint8Array(bytes)]);
  return {
    name,
    mime: 'application/pdf',
    bytes,
    preview: null,
    data: () => blob.arrayBuffer(),
    blob: () => Promise.resolve(blob),
  };
}

interface Session {
  readonly request: UploadRequest;
  readonly settle: (outcome: UploadOutcome) => void;
  cancelled: boolean;
}

class FakeClient {
  readonly sessions = new Map<string, Session>();
  clock = 0;

  readonly deps: DriveUploadDeps = {
    start: (request) => this.start(request),
    now: () => this.clock,
  };

  progress(id: string, sent: number, at: number): void {
    this.clock = at;
    patchUploadEntry(id, { sent });
  }

  settle(id: string, outcome: UploadOutcome): void {
    patchUploadEntry(id, { state: 'settled', outcome });
    this.sessions.get(id)?.settle(outcome);
  }

  ids(): readonly string[] {
    return [...this.sessions.keys()];
  }

  private start(request: UploadRequest): UploadHandle {
    const id = `fake-${String(this.sessions.size + 1)}`;
    let settle: (outcome: UploadOutcome) => void = () => undefined;
    const outcome = new Promise<UploadOutcome>((resolve) => {
      settle = resolve;
    });
    const session: Session = { request, settle, cancelled: false };
    this.sessions.set(id, session);
    addUploadEntry({
      id,
      name: request.name,
      size: request.source.size,
      sent: 0,
      state: 'uploading',
      outcome: null,
    });
    return {
      id,
      outcome,
      pause: (): Promise<void> => {
        patchUploadEntry(id, { state: 'paused' });
        return Promise.resolve();
      },
      resume: (): void => {
        patchUploadEntry(id, { state: 'uploading' });
      },
      cancel: (): Promise<void> => {
        session.cancelled = true;
        this.settle(id, { kind: 'cancelled' });
        return Promise.resolve();
      },
    };
  }
}

function rows(folderId = FOLDER): readonly UploadRow[] {
  return rowsOf(driveUploads.get().records, uploadEntries.get(), folderId);
}

function settled(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function only<T>(items: readonly T[]): T {
  const [first] = items;
  if (first === undefined || items.length !== 1) throw new Error('expected one item');
  return first;
}

describe('drive uploads', () => {
  let client: FakeClient;

  beforeEach(() => {
    client = new FakeClient();
    uploadEntries.set([]);
    driveUploads.set(EMPTY_UPLOADS);
  });

  it('sends each file to the folder it was dropped on and reports progress', async () => {
    await uploadFiles(
      [picked('Lease.pdf', 1000), picked('Plan.pdf', 3000)],
      IN_FOLDER,
      client.deps,
    );
    expect(client.ids()).toHaveLength(2);
    const [first] = client.ids();
    expect(client.sessions.get(first ?? '')?.request).toMatchObject({
      name: 'Lease.pdf',
      target: { kind: 'folder', folderId: FOLDER },
    });
    client.progress(first ?? '', 500, 0);
    const summary = summaryOf(rows());
    expect(summary).toMatchObject({ total: 2, sending: 2, sent: 500, size: 4000 });
    expect(headlineOf(summary, 'Kitchen remodel')).toBe('Uploading 1 of 2 to Kitchen remodel');
    expect(rows(OTHER)).toEqual([]);
  });

  it('sends files dropped on the top of a drive to that drive', async () => {
    await uploadFiles([picked('Notes.txt', 10)], { kind: 'drive', rootId: ROOT }, client.deps);
    expect(client.sessions.get(only(client.ids()))?.request).toMatchObject({
      identity: `drive-upload:${ROOT}:Notes.txt:`,
      target: { kind: 'drive', rootId: ROOT },
    });
    expect(rows(ROOT)).toHaveLength(1);
    expect(rows()).toEqual([]);
  });

  it('keys each upload by folder, name and the file modified time so resumes never mix files', async () => {
    const file = new File([new Uint8Array(10)], 'Lease.pdf', { lastModified: 1700 });
    const pickedFile: PickedBlob = {
      ...picked('Lease.pdf', 10),
      blob: () => Promise.resolve(file),
    };
    await uploadFiles([pickedFile, picked('Lease.pdf', 10)], IN_FOLDER, client.deps);
    expect([...client.sessions.values()].map((session) => session.request.identity)).toEqual([
      `drive-upload:${FOLDER}:Lease.pdf:1700`,
      `drive-upload:${FOLDER}:Lease.pdf:`,
    ]);
  });

  it('measures the rate from progress events only', async () => {
    await uploadFiles([picked('Video.mov', 10_000)], IN_FOLDER, client.deps);
    const id = only(client.ids());
    client.progress(id, 1000, 1000);
    client.progress(id, 5000, 3000);
    expect(driveUploads.get().clocks.get(FOLDER)?.rate).toBe(2000);
  });

  it('pauses and resumes one file or the whole folder', async () => {
    await uploadFiles([picked('A.pdf', 100), picked('B.pdf', 100)], IN_FOLDER, client.deps);
    const first = rows()[0];
    pauseUpload(first?.key ?? '');
    await settled();
    expect(rows().map((row) => row.state.kind)).toEqual(['paused', 'sending']);
    resumeUpload(first?.key ?? '');
    pauseFolder(FOLDER);
    await settled();
    expect(rows().map((row) => row.state.kind)).toEqual(['paused', 'paused']);
    expect(driveUploads.get().clocks.has(FOLDER)).toBe(false);
  });

  it('cancels a file and removes its row', async () => {
    await uploadFiles([picked('A.pdf', 100)], IN_FOLDER, client.deps);
    const id = only(client.ids());
    cancelUpload(only(rows()).key);
    await settled();
    expect(client.sessions.get(id)?.cancelled).toBe(true);
    expect(rows()).toEqual([]);
    expect(uploadEntries.get()).toEqual([]);
  });

  it('says over quota and no space plainly and does not retry them', async () => {
    await uploadFiles([picked('A.pdf', 100), picked('B.pdf', 100)], IN_FOLDER, client.deps);
    const [a, b] = client.ids();
    client.settle(a ?? '', { kind: 'failed', failure: { kind: 'over-quota' } });
    client.settle(b ?? '', { kind: 'failed', failure: { kind: 'no-space' } });
    await settled();
    expect(rows().map((row) => row.state)).toEqual([
      {
        kind: 'failed',
        text: 'Your Drive space is full. Free some space or ask the owner for more.',
        retryable: false,
      },
      { kind: 'failed', text: 'The hub’s disk is full. Nothing was saved.', retryable: false },
    ]);
    retryFolderId(FOLDER, client.deps);
    expect(client.ids()).toHaveLength(2);
  });

  it('starts an upload again with the same file when the hub comes back', async () => {
    await uploadFiles([picked('A.pdf', 100)], IN_FOLDER, client.deps);
    const id = only(client.ids());
    client.settle(id, { kind: 'failed', failure: { kind: 'hub-unreachable', reason: 'offline' } });
    await settled();
    retryFolderId(FOLDER, client.deps);
    const [, again] = client.ids();
    expect(client.sessions.get(again ?? '')?.request.source).toBe(
      client.sessions.get(id)?.request.source,
    );
    expect(only(rows()).state.kind).toBe('sending');
    expect(uploadEntries.get().map((entry) => entry.id)).toEqual([again]);
  });

  it('shows the name the hub chose on a clash and clears settled rows', async () => {
    await uploadFiles([picked('Lease.pdf', 100)], IN_FOLDER, client.deps);
    client.settle(only(client.ids()), {
      kind: 'done',
      itemId: '00000000-0000-4000-8000-0000000000a1',
      name: 'Lease (2).pdf',
      renamed: true,
    });
    await settled();
    expect(only(rows()).state).toEqual({ kind: 'done', storedAs: 'Lease (2).pdf' });
    expect(headlineOf(summaryOf(rows()), 'Kitchen remodel')).toBe(
      'Uploaded 1 file to Kitchen remodel',
    );
    clearFolder(rows());
    expect(driveUploads.get()).toBe(EMPTY_UPLOADS);
    expect(uploadEntries.get()).toEqual([]);
  });
});
