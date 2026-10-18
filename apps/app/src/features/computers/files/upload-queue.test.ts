import { describe, expect, it } from 'vitest';
import type { FileUploadChunk } from '@smarteverything/domain';
import type { PickedFile } from '../../../platform/pick-files';
import { UploadQueue } from './upload-queue';

function file(name: string, size: number): PickedFile {
  return {
    name,
    mime: 'text/plain',
    bytes: size,
    preview: null,
    data: () => Promise.resolve(new Uint8Array(size).buffer),
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

function queue(taken: string[] = []): {
  q: UploadQueue;
  add: (files: PickedFile[]) => void;
  sent: FileUploadChunk[];
  settled: number[];
} {
  const sent: FileUploadChunk[] = [];
  const settled: number[] = [];
  const q = new UploadQueue(
    (chunk) => {
      sent.push(chunk);
      return Promise.resolve({ path: chunk.path, size: chunk.start, complete: chunk.final });
    },
    () => {
      settled.push(sent.length);
    },
  );
  const add = (files: PickedFile[]): void => {
    q.add(files, '/home/dana', new Set(taken));
  };
  return { q, add, sent, settled };
}

describe('UploadQueue', () => {
  it('uploads a file into the folder and finishes it', async () => {
    const { q, add, sent, settled } = queue();
    add([file('a.txt', 3)]);
    await settle();
    await settle();
    expect(sent.map((chunk) => [chunk.path, chunk.final, chunk.replace])).toEqual([
      ['/home/dana/a.txt', true, false],
    ]);
    expect(q.items.get().map((item) => item.state)).toEqual(['done']);
    expect(settled).toHaveLength(1);
  });

  it('holds a name that is already there until the person chooses', async () => {
    const { q, add, sent } = queue(['a.txt']);
    add([file('a.txt', 3), file('b.txt', 1)]);
    await settle();
    await settle();
    expect(q.items.get().map((item) => item.state)).toEqual(['conflict', 'done']);
    q.decide(1, 'both');
    await settle();
    await settle();
    expect(sent.map((chunk) => chunk.path)).toContain('/home/dana/a (2).txt');
    expect(q.items.get().map((item) => item.state)).toEqual(['done', 'done']);
  });

  it('replaces on request and skips on request', async () => {
    const { q, add, sent } = queue(['a.txt', 'b.txt']);
    add([file('a.txt', 1), file('b.txt', 1)]);
    q.decide(1, 'replace');
    q.decide(2, 'skip');
    await settle();
    await settle();
    expect(sent.map((chunk) => [chunk.path, chunk.replace])).toEqual([['/home/dana/a.txt', true]]);
    expect(q.items.get().map((item) => item.state)).toEqual(['done', 'skipped']);
  });

  it('marks a failed upload with the reason and goes on', async () => {
    const q = new UploadQueue(
      (chunk) =>
        chunk.path.endsWith('bad')
          ? Promise.reject(new Error('Not enough room'))
          : Promise.resolve({ path: chunk.path, size: 1, complete: true }),
      () => undefined,
    );
    q.add([file('bad', 1), file('good', 1)], '/h', new Set());
    for (let turn = 0; turn < 6; turn += 1) await settle();
    expect(q.items.get().map((item) => item.state)).toEqual(['failed', 'done']);
    expect(q.items.get()[0]?.error).toContain('Not enough room');
  });

  it('stops sending a cancelled file', async () => {
    const { q, add, sent } = queue();
    add([file('a.txt', 1)]);
    q.cancelAll();
    await settle();
    await settle();
    expect(sent).toHaveLength(0);
    expect(q.items.get().map((item) => item.state)).toEqual(['cancelled']);
  });
});
