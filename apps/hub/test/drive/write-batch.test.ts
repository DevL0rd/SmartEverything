import { describe, expect, it } from 'vitest';
import { WriteBatch } from '../../src/drive/write-batch';
import { SLICE_MS } from '../../src/store/slices';
import { captureLogs, testLogger } from '../support/logs';

interface Log {
  readonly writes: string[][];
  readonly committed: string[];
}

function writerOf(log: Log): { write: <T>(work: () => T) => T } {
  return {
    write: <T>(work: () => T): T => {
      const pending: string[] = [];
      log.writes.push(pending);
      const value = work();
      log.committed.push(...pending);
      return value;
    },
  };
}

function busyFor(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    continue;
  }
}

describe('write batch', () => {
  it('runs every write queued in one turn inside one transaction and resolves each result', async () => {
    const log: Log = { writes: [], committed: [] };
    const batch = new WriteBatch(writerOf(log), testLogger());
    const mark = (name: string) => (): string => {
      log.writes.at(-1)?.push(name);
      return name.toUpperCase();
    };
    const results = await Promise.all([
      batch.write(mark('a')),
      batch.write(mark('b')),
      batch.write(mark('c')),
    ]);
    expect(results).toEqual(['A', 'B', 'C']);
    expect(log.writes).toEqual([['a', 'b', 'c']]);
  });

  it('rolls the batch back and runs each write alone when one of them fails', async () => {
    const logs = captureLogs();
    const log: Log = { writes: [], committed: [] };
    const batch = new WriteBatch(writerOf(log), testLogger());
    const mark = (name: string) => (): string => {
      log.writes.at(-1)?.push(name);
      if (name === 'b') throw new Error('b failed');
      return name;
    };
    const settled = await Promise.allSettled([
      batch.write(mark('a')),
      batch.write(mark('b')),
      batch.write(mark('c')),
    ]);
    expect(settled.map((entry) => entry.status)).toEqual(['fulfilled', 'rejected', 'fulfilled']);
    expect(log.committed).toEqual(['a', 'c']);
    expect(log.writes).toEqual([['a', 'b'], ['a'], ['b'], ['c']]);
    expect(logs.events()).toEqual(['drive.write_batch_split']);
  });

  it('gives the loop back between transactions when the queued work outlasts a slice', async () => {
    const log: Log = { writes: [], committed: [] };
    let yields = 0;
    const batch = new WriteBatch(writerOf(log), testLogger(), (resume) => {
      yields += 1;
      setImmediate(resume);
    });
    const names = ['a', 'b', 'c', 'd', 'e', 'f'];
    const results = await Promise.all(
      names.map((name) =>
        batch.write(() => {
          busyFor(SLICE_MS / 2 + 0.5);
          log.writes.at(-1)?.push(name);
          return name;
        }),
      ),
    );
    expect(results).toEqual(names);
    expect(log.writes.length).toBeGreaterThan(1);
    expect(log.writes.flat()).toEqual(names);
    expect(yields).toBe(log.writes.length);
  });
});
