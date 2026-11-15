import { describe, expect, it } from 'vitest';
import type { PickedBlob } from '../../../platform/pick-files';
import type { ConflictRule, UploadJob, UploadOutcome, UploadTransport } from '../source/types';
import { UploadQueue, uniqueName, type UploadItem } from './upload-queue';

const HOME = { place: '/home/dana', folder: null };

function file(name: string, size: number): PickedBlob {
  return {
    name,
    mime: 'text/plain',
    bytes: size,
    preview: null,
    data: () => Promise.resolve(new Uint8Array(size).buffer),
    blob: () => Promise.resolve(new Blob([new Uint8Array(size)])),
  };
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0);
  });
}

interface Rig {
  readonly queue: UploadQueue;
  readonly jobs: UploadJob[];
  readonly settled: UploadItem[];
  readonly finish: (index: number, outcome: UploadOutcome) => void;
  readonly paused: number[];
}

function rig(conflicts: ConflictRule = 'ask', serial = true): Rig {
  const jobs: UploadJob[] = [];
  const settled: UploadItem[] = [];
  const paused: number[] = [];
  const resolvers: ((outcome: UploadOutcome) => void)[] = [];
  const transport: UploadTransport = {
    conflicts,
    serial,
    start: (job, progress) => {
      jobs.push(job);
      progress(Math.floor(job.file.bytes / 2));
      return {
        outcome: new Promise((resolve) => {
          resolvers.push(resolve);
        }),
        pause: (): Promise<void> => {
          paused.push(jobs.indexOf(job));
          return Promise.resolve();
        },
        resume: () => undefined,
        cancel: (): Promise<void> => {
          resolvers[jobs.indexOf(job)]?.({ kind: 'cancelled' });
          return Promise.resolve();
        },
      };
    },
  };
  const queue = new UploadQueue(transport, (item) => {
    settled.push(item);
  });
  return {
    queue,
    jobs,
    settled,
    paused,
    finish: (index, outcome): void => {
      resolvers[index]?.(outcome);
    },
  };
}

const states = (queue: UploadQueue): readonly string[] =>
  queue.items.get().map((item) => item.state);

describe('UploadQueue', () => {
  it('sends one file at a time for a serial transport and finishes each', async () => {
    const { queue, jobs, settled, finish } = rig();
    queue.add([file('a.txt', 4), file('b.txt', 2)], HOME, new Set());
    expect(states(queue)).toEqual(['sending', 'waiting']);
    expect(queue.items.get()[0]?.sent).toBe(2);
    finish(0, { kind: 'done', name: 'a.txt', renamed: false });
    await settle();
    expect(states(queue)).toEqual(['done', 'sending']);
    expect(queue.items.get()[0]?.sent).toBe(4);
    finish(1, { kind: 'done', name: 'b (2).txt', renamed: true });
    await settle();
    expect(jobs.map((job) => [job.name, job.folder])).toEqual([
      ['a.txt', HOME],
      ['b.txt', HOME],
    ]);
    expect(queue.items.get()[1]?.storedAs).toBe('b (2).txt');
    expect(settled.map((item) => item.name)).toEqual(['a.txt', 'b.txt']);
  });

  it('starts every file at once for a parallel transport', () => {
    const { queue } = rig('number', false);
    queue.add([file('a.txt', 1), file('b.txt', 1)], HOME, new Set());
    expect(states(queue)).toEqual(['sending', 'sending']);
  });

  it('holds a name that is already there until the person chooses, when the transport asks', async () => {
    const { queue, jobs, finish } = rig();
    queue.add([file('a.txt', 3), file('b.txt', 1)], HOME, new Set(['a.txt']));
    expect(states(queue)).toEqual(['conflict', 'sending']);
    queue.decide('1', 'both');
    finish(0, { kind: 'done', name: 'b.txt', renamed: false });
    await settle();
    expect(jobs.map((job) => [job.name, job.replace])).toEqual([
      ['b.txt', false],
      ['a (2).txt', false],
    ]);
  });

  it('replaces or skips on request, and never asks when the transport numbers names', () => {
    const asked = rig();
    asked.queue.add([file('a.txt', 1), file('b.txt', 1)], HOME, new Set(['a.txt', 'b.txt']));
    asked.queue.decide('1', 'replace');
    asked.queue.decide('2', 'skip');
    expect(asked.jobs.map((job) => [job.name, job.replace])).toEqual([['a.txt', true]]);
    expect(states(asked.queue)).toEqual(['sending', 'skipped']);
    const numbered = rig('number');
    numbered.queue.add([file('a.txt', 1)], HOME, new Set(['a.txt']));
    expect(states(numbered.queue)).toEqual(['sending']);
  });

  it('marks a failed upload with the reason, goes on and sends it again on retry', async () => {
    const { queue, jobs, finish } = rig();
    queue.add([file('bad', 1), file('good', 1)], HOME, new Set());
    finish(0, { kind: 'failed', text: 'Not enough room', retryable: true });
    await settle();
    expect(states(queue)).toEqual(['failed', 'sending']);
    expect(queue.items.get()[0]?.error).toBe('Not enough room');
    finish(1, { kind: 'done', name: 'good', renamed: false });
    await settle();
    queue.retry('1');
    expect(states(queue)).toEqual(['sending', 'done']);
    expect(jobs).toHaveLength(3);
  });

  it('pauses only a sending upload and cancels the rest', async () => {
    const { queue, paused } = rig();
    queue.add([file('a.txt', 1), file('b.txt', 1)], HOME, new Set());
    queue.pause('2');
    queue.pause('1');
    expect(paused).toEqual([0]);
    expect(states(queue)).toEqual(['paused', 'waiting']);
    queue.cancelAll();
    await settle();
    expect(states(queue)).toEqual(['cancelled', 'cancelled']);
    queue.clearSettled('/home/dana');
    expect(queue.items.get()).toEqual([]);
  });

  it('numbers a clashing name before the extension', () => {
    expect(uniqueName('a.txt', new Set(['a.txt', 'a (2).txt']))).toBe('a (3).txt');
    expect(uniqueName('notes', new Set(['notes']))).toBe('notes (2)');
    expect(uniqueName('b.txt', new Set())).toBe('b.txt');
  });
});
