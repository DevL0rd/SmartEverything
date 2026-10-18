import { describe, expect, it } from 'vitest';
import { AsyncReading } from '../../../src/node/collectors/portable/async-reading';

function deferred<T>(): {
  readonly promise: Promise<T>;
  readonly resolve: (value: T) => void;
  readonly reject: (cause: unknown) => void;
} {
  let resolve: (value: T) => void = () => undefined;
  let reject: (cause: unknown) => void = () => undefined;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

describe('a reading that loads in the background', () => {
  it('has nothing until the first load finished, then the latest value', async () => {
    const load = deferred<number>();
    const reading = new AsyncReading(
      () => load.promise,
      () => undefined,
    );
    expect(reading.read()).toBeNull();
    load.resolve(7);
    await reading.prime();
    expect(reading.read()?.value).toBe(7);
  });

  it('starts one load at a time and lets a second caller wait for the same one', async () => {
    let loads = 0;
    const load = deferred<number>();
    const reading = new AsyncReading(
      () => {
        loads += 1;
        return load.promise;
      },
      () => undefined,
    );
    reading.read();
    const waiting = reading.prime();
    reading.read();
    expect(loads).toBe(1);
    load.resolve(1);
    await waiting;
    expect(reading.read()?.value).toBe(1);
  });

  it('reports a failed background load and tries again on the next read', async () => {
    const failures: unknown[] = [];
    let calls = 0;
    const reading = new AsyncReading(
      () => {
        calls += 1;
        return calls === 1 ? Promise.reject(new Error('down')) : Promise.resolve(calls);
      },
      (cause) => failures.push(cause),
    );
    reading.read();
    await new Promise((resolve) => setImmediate(resolve));
    expect(failures).toHaveLength(1);
    reading.read();
    await new Promise((resolve) => setImmediate(resolve));
    expect(reading.read()?.value).toBe(2);
  });

  it('hands the failure to the one who waits for it', async () => {
    const reading = new AsyncReading(
      () => Promise.reject(new Error('down')),
      () => undefined,
    );
    await expect(reading.prime()).rejects.toThrow('down');
  });
});
