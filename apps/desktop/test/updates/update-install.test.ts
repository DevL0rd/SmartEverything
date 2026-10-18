import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  appRootIn,
  extractZip,
  siblingOf,
  swapBack,
  swapIn,
  type RunCommand,
} from '../../src/updates/update-install.js';

let base = '';

beforeEach(async () => {
  base = await mkdtemp(join(tmpdir(), 'update-install-'));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function app(name: string, version: string): Promise<string> {
  const root = join(base, name);
  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'version'), version);
  return root;
}

function recorder(): { readonly calls: string[]; readonly run: RunCommand } {
  const calls: string[] = [];
  return {
    calls,
    run: (file, args): Promise<void> => {
      calls.push([file, ...args].join(' '));
      return Promise.resolve();
    },
  };
}

describe('unpacking a downloaded app', () => {
  it('uses unzip on Linux into a clean folder', async () => {
    const { calls, run } = recorder();
    const destination = join(base, 'unpacked');
    await mkdir(destination);
    await writeFile(join(destination, 'stale'), 'x');
    await extractZip(run, 'linux', '/tmp/a.zip', destination);
    expect(calls).toStrictEqual([`unzip -q /tmp/a.zip -d ${destination}`]);
    expect(await readdir(base)).not.toContain('unpacked');
  });

  it('uses ditto on a Mac', async () => {
    const { calls, run } = recorder();
    await extractZip(run, 'darwin', '/tmp/a.zip', join(base, 'u'));
    expect(calls).toStrictEqual([`ditto -x -k /tmp/a.zip ${join(base, 'u')}`]);
  });

  it('finds the single app folder inside', async () => {
    const root = await app('unpacked/SmartEverything-linux-x64', '2');
    expect(await appRootIn(join(base, 'unpacked'))).toBe(root);
  });

  it('ignores the macOS metadata folder', async () => {
    await app('unpacked/SmartEverything.app', '2');
    await mkdir(join(base, 'unpacked', '__MACOSX'));
    expect(await appRootIn(join(base, 'unpacked'))).toBe(
      join(base, 'unpacked', 'SmartEverything.app'),
    );
  });

  it('refuses a download that holds more than one folder', async () => {
    await app('unpacked/a', '1');
    await app('unpacked/b', '1');
    await expect(appRootIn(join(base, 'unpacked'))).rejects.toThrow(
      /expected one app folder, found a, b/u,
    );
  });

  it('refuses an empty download', async () => {
    await mkdir(join(base, 'unpacked'));
    await expect(appRootIn(join(base, 'unpacked'))).rejects.toThrow(/found nothing/u);
  });
});

describe('swapping the app folder', () => {
  it('keeps the old folder as .previous and puts the new one in place', async () => {
    const root = await app('SmartEverything', 'old');
    const next = await app('next', 'new');
    const replaced = await swapIn(root, next);
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('new');
    expect(await readFile(join(replaced.previous, 'version'), 'utf8')).toBe('old');
    expect(replaced.previous).toBe(siblingOf(root, 'previous'));
  });

  it('replaces an older .previous', async () => {
    const root = await app('SmartEverything', 'two');
    await app('SmartEverything.previous', 'one');
    await swapIn(root, await app('next', 'three'));
    expect(await readFile(join(base, 'SmartEverything.previous', 'version'), 'utf8')).toBe('two');
  });

  it('puts the old folder back when the new one cannot be moved in', async () => {
    const root = await app('SmartEverything', 'old');
    await expect(swapIn(root, join(base, 'missing'))).rejects.toThrow();
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('old');
  });

  it('rolls back to the previous folder', async () => {
    const root = await app('SmartEverything', 'old');
    const replaced = await swapIn(root, await app('next', 'new'));
    await swapBack(replaced);
    expect(await readFile(join(root, 'version'), 'utf8')).toBe('old');
    expect(await readdir(base)).toStrictEqual(['SmartEverything']);
  });
});
