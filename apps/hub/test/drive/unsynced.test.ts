import { mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { moveWithin, type DriveWriteRoot } from '../../src/drive/intents';
import { PARALLEL_SYNCS, syncPaths } from '../../src/drive/unsynced';
import { nodeFiles } from '../../src/drive/versions';

let base = '';

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'hub-drive-unsynced-')));
});

afterEach(async () => {
  await rm(base, { recursive: true, force: true });
});

async function filesIn(folder: string, count: number): Promise<string[]> {
  await mkdir(folder, { recursive: true });
  const paths = Array.from({ length: count }, (_, index) => join(folder, `f${String(index)}`));
  await Promise.all(paths.map((path) => writeFile(path, path)));
  return paths;
}

describe('the durability barrier of a batch', () => {
  it('leaves both folders of a deferred move to the barrier', async () => {
    const root: DriveWriteRoot = { id: 'r', path: base, versions: false };
    await filesIn(join(base, '.tmp'), 1);
    const deferred = new Set<string>();
    await moveWithin(
      nodeFiles,
      root,
      { from: '.tmp/f0', to: 'docs/a.txt', mode: 'replace' },
      deferred,
    );
    expect([...deferred].sort()).toEqual([join(base, 'docs'), join(base, '.tmp')].sort());
  });

  it('syncs files and folders of a small batch and of a large one', async () => {
    const few = await filesIn(join(base, 'few'), PARALLEL_SYNCS - 1);
    const many = await filesIn(join(base, 'many'), PARALLEL_SYNCS * 4);
    await expect(syncPaths([...few, join(base, 'few')])).resolves.toBeUndefined();
    await expect(syncPaths([...many, join(base, 'many')])).resolves.toBeUndefined();
    await expect(syncPaths([])).resolves.toBeUndefined();
  });

  it('fails loudly when a path it must make durable is gone', async () => {
    await expect(syncPaths([join(base, 'missing')])).rejects.toThrow(/ENOENT/);
  });
});
