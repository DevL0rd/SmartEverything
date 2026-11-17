import { describe, expect, it } from 'vitest';
import { SLICE_MS, inSlices } from '../../src/store/slices';

function busyFor(ms: number): void {
  const until = performance.now() + ms;
  while (performance.now() < until) {
    continue;
  }
}

describe('work in slices', () => {
  it('does every item, each slice in its own write, and gives the loop back between slices', async () => {
    const done: number[] = [];
    const writes: number[][] = [];
    let yields = 0;
    const writer = {
      write: <T>(work: () => T): T => {
        const before = done.length;
        const value = work();
        writes.push(done.slice(before));
        return value;
      },
    };
    await inSlices(
      writer,
      [1, 2, 3, 4, 5, 6],
      (item) => {
        busyFor(SLICE_MS / 2 + 0.5);
        done.push(item);
      },
      (resume) => {
        yields += 1;
        setImmediate(resume);
      },
    );
    expect(done).toEqual([1, 2, 3, 4, 5, 6]);
    expect(writes.length).toBeGreaterThan(1);
    expect(writes.flat()).toEqual(done);
    expect(yields).toBe(writes.length - 1);
  });

  it('finishes in one write without yielding when the work is quick', async () => {
    let writes = 0;
    let yields = 0;
    await inSlices(
      {
        write: <T>(work: () => T): T => {
          writes += 1;
          return work();
        },
      },
      [],
      () => undefined,
      () => {
        yields += 1;
      },
    );
    expect(writes).toBe(1);
    expect(yields).toBe(0);
  });

  it('stops at the failing item and passes the failure on', async () => {
    const done: number[] = [];
    await expect(
      inSlices({ write: (work) => work() }, [1, 2, 3], (item) => {
        if (item === 2) throw new Error('item 2 failed');
        done.push(item);
      }),
    ).rejects.toThrow('item 2 failed');
    expect(done).toEqual([1]);
  });
});
