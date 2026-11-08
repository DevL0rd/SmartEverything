import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pid } from 'node:process';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { hubLayout } from '../src/data-layout';
import { DataDirectoryLockedError, lockDataDirectory } from '../src/data-lock';
import { PidLockedError, pidHolder, pidLock } from '../src/pid-lock';

let directory = '';
let path = '';

beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), 'hub-pid-lock-'));
  path = join(directory, 'some.pid');
});

afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});

describe('pidLock', () => {
  it('writes the own pid, refuses a second holder in the same process and frees the file on release', async () => {
    const lock = await pidLock(path);
    expect(await readFile(path, 'utf8')).toBe(String(pid));
    await expect(pidLock(path)).rejects.toThrow(PidLockedError);
    await lock.release();
    await expect(readFile(path, 'utf8')).rejects.toMatchObject({ code: 'ENOENT' });
    await (await pidLock(path)).release();
  });

  it('refuses a file held by another live process and names its pid', async () => {
    await writeFile(path, '4242\n');
    await expect(pidLock(path, { pid: 7, isAlive: (id) => id === 4242 })).rejects.toMatchObject({
      holder: 4242,
    });
    expect(await pidHolder(path)).toBe(4242);
  });

  it('replaces a file left by a process that is gone', async () => {
    await writeFile(path, '4242');
    const lock = await pidLock(path, { pid: 7, isAlive: () => false });
    expect(await pidHolder(path)).toBe(7);
    await lock.release();
  });

  it('takes over a file that already holds its own pid', async () => {
    await writeFile(path, '7');
    const lock = await pidLock(path, { pid: 7, isAlive: () => true });
    expect(await pidHolder(path)).toBe(7);
    await lock.release();
  });

  it('reads no holder from a missing or unreadable-number file', async () => {
    expect(await pidHolder(path)).toBeNull();
    await writeFile(path, 'not a pid');
    expect(await pidHolder(path)).toBeNull();
  });
});

describe('lockDataDirectory', () => {
  it('refuses a second hub on the same data directory and lets a later one start after release', async () => {
    const layout = hubLayout(directory, {});
    await writeFile(layout.lock, '1');
    await expect(lockDataDirectory(layout)).rejects.toThrow(
      new DataDirectoryLockedError(directory, 1),
    );
    await rm(layout.lock);
    const first = await lockDataDirectory(layout);
    await expect(lockDataDirectory(layout)).rejects.toThrow(DataDirectoryLockedError);
    await first.release();
    await (await lockDataDirectory(layout)).release();
  });
});
