import { describe, expect, it } from 'vitest';
import { WriteQueue } from '../src/state/write-queue';

interface Item {
  readonly key: string;
  readonly value: number;
}

function queue(
  writes: (readonly Item[])[],
  failFirst: boolean,
  failures: unknown[],
): WriteQueue<Item, string> {
  let failing = failFirst;
  return new WriteQueue<Item, string>({
    write: (items): Promise<readonly string[]> => {
      writes.push(items);
      if (failing) {
        failing = false;
        return Promise.reject(new Error('down'));
      }
      return Promise.resolve(items.map((item) => `${item.key}=${String(item.value)}`));
    },
    keyOf: (item) => (item.key === 'free' ? null : item.key),
    failed: (_items, cause): void => {
      failures.push(cause);
    },
  });
}

describe('WriteQueue', () => {
  it('writes everything pushed in the same turn as one batch, newest value per key', async () => {
    const writes: (readonly Item[])[] = [];
    const subject = queue(writes, false, []);
    const first = subject.push({ key: 'a', value: 1 });
    const second = subject.push({ key: 'a', value: 2 });
    subject.enqueue({ key: 'b', value: 3 });
    const free = [subject.push({ key: 'free', value: 4 }), subject.push({ key: 'free', value: 5 })];
    expect(await first).toBe('a=2');
    expect(await second).toBe('a=2');
    expect(await Promise.all(free)).toStrictEqual(['free=4', 'free=5']);
    expect(writes).toStrictEqual([
      [
        { key: 'a', value: 2 },
        { key: 'b', value: 3 },
        { key: 'free', value: 4 },
        { key: 'free', value: 5 },
      ],
    ]);
  });

  it('collects what arrives during a write into the next batch', async () => {
    const writes: (readonly Item[])[] = [];
    const subject = queue(writes, false, []);
    const first = subject.push({ key: 'a', value: 1 });
    await Promise.resolve();
    await new Promise((resolve) => setImmediate(resolve));
    subject.enqueue({ key: 'b', value: 2 });
    subject.enqueue({ key: 'c', value: 3 });
    await first;
    await subject.settled();
    expect(writes).toStrictEqual([
      [{ key: 'a', value: 1 }],
      [
        { key: 'b', value: 2 },
        { key: 'c', value: 3 },
      ],
    ]);
  });

  it('rejects the waiters of a failed batch, reports it once, and keeps going', async () => {
    const failures: unknown[] = [];
    const subject = queue([], true, failures);
    const failed = subject.push({ key: 'a', value: 1 });
    await expect(failed).rejects.toThrow('down');
    expect(failures).toHaveLength(1);
    await expect(subject.push({ key: 'a', value: 2 })).resolves.toBe('a=2');
  });

  it('rejects when the writer returns fewer results than items', async () => {
    const subject = new WriteQueue<Item, string>({
      write: (): Promise<readonly string[]> => Promise.resolve([]),
      keyOf: (): null => null,
      failed: (): void => undefined,
    });
    await expect(subject.push({ key: 'a', value: 1 })).rejects.toThrow(
      'A batched write returned no result for item 0; expected one result per item, received 0.',
    );
  });

  it('settles immediately when nothing is pending', async () => {
    const subject = queue([], false, []);
    await expect(subject.settled()).resolves.toBeUndefined();
  });
});
