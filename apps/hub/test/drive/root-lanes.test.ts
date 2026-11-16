import { describe, expect, it } from 'vitest';
import { DriveRootLanes } from '../../src/drive/root-lanes';

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const ROOT = 'root';

describe('the drive root lanes', () => {
  it('runs landings of different inodes together and one inode in order', async () => {
    const lanes = new DriveRootLanes();
    const log: string[] = [];
    const first = deferred();
    const a = lanes.shared(ROOT, 1, async () => {
      log.push('a start');
      await first.promise;
      log.push('a end');
    });
    const b = lanes.shared(ROOT, 2, () => {
      log.push('b');
      return Promise.resolve();
    });
    const c = lanes.shared(ROOT, 1, () => {
      log.push('c');
      return Promise.resolve();
    });
    await b;
    expect(log).toEqual(['a start', 'b']);
    first.resolve();
    await Promise.all([a, c]);
    expect(log).toEqual(['a start', 'b', 'a end', 'c']);
  });

  it('lets a namespace change wait for earlier landings and later landings wait for it', async () => {
    const lanes = new DriveRootLanes();
    const log: string[] = [];
    const landing = deferred();
    const change = deferred();
    const early = lanes.shared(ROOT, 1, async () => {
      await landing.promise;
      log.push('early landing');
    });
    const exclusive = lanes.run([ROOT], async () => {
      log.push('change start');
      await change.promise;
      log.push('change end');
    });
    const late = lanes.shared(ROOT, 2, () => {
      log.push('late landing');
      return Promise.resolve();
    });
    await Promise.resolve();
    expect(log).toEqual([]);
    landing.resolve();
    await early;
    await new Promise((resolve) => setImmediate(resolve));
    expect(log).toEqual(['early landing', 'change start']);
    change.resolve();
    await Promise.all([exclusive, late]);
    expect(log).toEqual(['early landing', 'change start', 'change end', 'late landing']);
  });

  it('keeps going after a failed operation', async () => {
    const lanes = new DriveRootLanes();
    await expect(lanes.run([ROOT], () => Promise.reject(new Error('no')))).rejects.toThrow('no');
    await expect(lanes.shared(ROOT, 1, () => Promise.resolve(5))).resolves.toBe(5);
    await expect(lanes.run([ROOT], () => Promise.resolve(6))).resolves.toBe(6);
  });
});

describe('changes across drives', () => {
  it('holds every drive of a change and never deadlocks two changes that name them in another order', async () => {
    const lanes = new DriveRootLanes();
    const log: string[] = [];
    const first = deferred();
    const both = lanes.run(['a', 'b'], async () => {
      log.push('both start');
      await first.promise;
      log.push('both end');
    });
    const reversed = lanes.run(['b', 'a'], () => {
      log.push('reversed');
      return Promise.resolve();
    });
    const landing = lanes.shared('b', 1, () => {
      log.push('landing');
      return Promise.resolve();
    });
    const other = lanes.run(['c'], () => {
      log.push('other drive');
      return Promise.resolve();
    });
    await other;
    expect(log).toEqual(['both start', 'other drive']);
    first.resolve();
    await Promise.all([both, reversed, landing]);
    expect(log).toEqual(['both start', 'other drive', 'both end', 'reversed', 'landing']);
  });
});
