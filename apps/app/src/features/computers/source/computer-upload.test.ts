import {
  FILE_UPLOAD_CHUNK,
  API_ENDPOINTS as E,
  type FileUploadChunk,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import type { PickedBlob } from '../../../platform/pick-files';
import type { UploadJob } from '../../files';

interface Call {
  readonly body?: unknown;
}

const hub = vi.hoisted((): { chunks: unknown[]; fail: boolean; hold: Promise<void> | null } => ({
  chunks: [],
  fail: false,
  hold: null,
}));

vi.mock('../../../api/transport', () => ({
  api: (): unknown => ({
    call: async (endpoint: unknown, input: Call): Promise<unknown> => {
      if (hub.hold !== null) await hub.hold;
      if (hub.fail) throw new Error('The disk is full');
      hub.chunks.push(input.body);
      return { endpoint, size: 0, complete: true };
    },
  }),
}));

import { computerUpload } from './computer-upload';

const DEVICE = '0b9f3c2e-3c38-4a4f-9d55-6a1f6d4b2a10';

function file(size: number): PickedBlob {
  const bytes = new Uint8Array(size).fill(65);
  return {
    name: 'a.txt',
    mime: 'text/plain',
    bytes: size,
    preview: null,
    data: () => Promise.resolve(bytes.buffer),
    blob: () => Promise.resolve(new Blob([bytes])),
  };
}

function job(size: number, replace = false): UploadJob {
  return {
    id: '1',
    file: file(size),
    folder: { place: '/home/dana', folder: '/home/dana/Projects' },
    name: 'a.txt',
    replace,
  };
}

function chunksSent(): readonly FileUploadChunk[] {
  return hub.chunks.map((chunk) => FILE_UPLOAD_CHUNK.parse(chunk));
}

describe('computer upload', () => {
  it('asks about clashes and sends one file at a time', () => {
    const transport = computerUpload(DEVICE, () => undefined);
    expect(transport.conflicts).toBe('ask');
    expect(transport.serial).toBe(true);
    expect(E.uploadComputerFile.path).toContain('/files/upload');
  });

  it('sends the file into the folder as a final chunk and tells when it is done', async () => {
    hub.chunks = [];
    hub.fail = false;
    hub.hold = null;
    let done = 0;
    const progress: number[] = [];
    const handle = computerUpload(DEVICE, () => {
      done += 1;
    }).start(job(3, true), (sent) => progress.push(sent));
    expect(await handle.outcome).toEqual({ kind: 'done', name: 'a.txt', renamed: false });
    const [chunk] = chunksSent();
    expect(chunk).toMatchObject({
      path: '/home/dana/Projects/a.txt',
      start: 0,
      final: true,
      replace: true,
    });
    expect(progress).toEqual([3]);
    expect(done).toBe(1);
  });

  it('sends an empty file as one final empty chunk', async () => {
    hub.chunks = [];
    const handle = computerUpload(DEVICE, () => undefined).start(job(0), () => undefined);
    expect((await handle.outcome).kind).toBe('done');
    expect(chunksSent()).toHaveLength(1);
    expect(chunksSent()[0]?.final).toBe(true);
  });

  it('reports the reason when the computer refuses a chunk', async () => {
    hub.chunks = [];
    hub.fail = true;
    let done = 0;
    const handle = computerUpload(DEVICE, () => {
      done += 1;
    }).start(job(3), () => undefined);
    const outcome = await handle.outcome;
    expect(outcome.kind).toBe('failed');
    expect(outcome.kind === 'failed' ? outcome.text : '').toContain('disk is full');
    expect(outcome.kind === 'failed' && outcome.retryable).toBe(true);
    expect(done).toBe(0);
    hub.fail = false;
  });

  it('holds the pieces while paused and sends them all after resume', async () => {
    hub.chunks = [];
    hub.fail = false;
    hub.hold = null;
    const handle = computerUpload(DEVICE, () => undefined).start(job(5_000_000), () => undefined);
    await handle.pause();
    await new Promise<void>((resolve) => {
      setTimeout(resolve, 20);
    });
    expect(hub.chunks).toHaveLength(0);
    handle.resume();
    expect((await handle.outcome).kind).toBe('done');
    expect(chunksSent().map((chunk) => [chunk.start, chunk.final])).toEqual([
      [0, false],
      [4194304, true],
    ]);
  });

  it('stops sending once cancelled', async () => {
    hub.chunks = [];
    let release: () => void = () => undefined;
    hub.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const handle = computerUpload(DEVICE, () => undefined).start(job(3), () => undefined);
    await handle.cancel();
    release();
    hub.hold = null;
    expect(await handle.outcome).toEqual({ kind: 'cancelled' });
  });
});
