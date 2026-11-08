import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import {
  appendFile,
  copyFile,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  readlink,
  rm,
  symlink,
  utimes,
  writeFile,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { build } from 'esbuild';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { copyHubEntries, type CopyOptions } from '../../../src/data-layout/move/copy';
import {
  MOVE_DIRECTORY,
  readManifest,
  readMoveMarker,
  type ManifestEntry,
} from '../../../src/data-layout/move/manifest';

const ROOT_ID = '11111111-1111-4111-8111-111111111111';
const MOVE_ID = '33333333-3333-4333-8333-333333333333';
const MTIME_SECONDS = 1_700_000_000;
let bundleFolder: string;
let workerScript: string;
let work: string;
let source: string;
let target: string;

beforeAll(async () => {
  bundleFolder = await mkdtemp(join(tmpdir(), 'move-worker-'));
  workerScript = join(bundleFolder, 'hash-worker.mjs');
  await build({
    entryPoints: [
      fileURLToPath(new URL('../../../src/data-layout/move/hash-worker.ts', import.meta.url)),
    ],
    outfile: workerScript,
    bundle: true,
    platform: 'node',
    format: 'esm',
    target: 'node24',
    logLevel: 'silent',
  });
});

afterAll(async () => {
  await rm(bundleFolder, { recursive: true, force: true });
});

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'move-copy-'));
  source = join(work, 'old');
  target = join(work, 'new');
  await mkdir(join(source, 'people/p1/drive'), { recursive: true });
  await mkdir(join(source, 'system/database'), { recursive: true });
  await mkdir(join(source, 'tmp'), { recursive: true });
  await writeFile(join(source, 'people/p1/drive/a.txt'), 'alpha');
  await writeFile(join(source, 'system/database/smarteverything.db'), 'db');
  await writeFile(join(source, 'tmp/scratch'), 'scratch');
  await writeFile(join(source, 'foreign.txt'), 'foreign');
  await utimes(join(source, 'people/p1/drive/a.txt'), MTIME_SECONDS, MTIME_SECONDS);
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

function options(overrides: Partial<CopyOptions> = {}): CopyOptions {
  return {
    sourceRoot: source,
    targetRoot: target,
    rootId: ROOT_ID,
    moveId: MOVE_ID,
    workerScript,
    ...overrides,
  };
}

async function manifestOf(): Promise<readonly ManifestEntry[]> {
  const entries: ManifestEntry[] = [];
  for await (const entry of readManifest(target)) {
    entries.push(entry);
  }
  return entries;
}

describe('copyHubEntries', () => {
  it('copies hub entries only and records a manifest with hashes', async () => {
    const progress: string[] = [];
    const summary = await copyHubEntries(
      options({ onProgress: (item) => progress.push(item.relPath) }),
    );
    expect(await readFile(join(target, 'people/p1/drive/a.txt'), 'utf8')).toBe('alpha');
    await expect(lstat(join(target, 'foreign.txt'))).rejects.toThrow();
    await expect(lstat(join(target, 'tmp'))).rejects.toThrow();
    await expect(lstat(join(target, 'system/database/smarteverything.db'))).rejects.toThrow();
    const info = await lstat(join(target, 'people/p1/drive/a.txt'));
    expect(Math.floor(info.mtimeMs / 1000)).toBe(MTIME_SECONDS);
    expect(summary).toMatchObject({ files: 1, bytes: 5, unstable: 0, prefixHits: 0 });
    expect(summary.areas.people).toEqual({ files: 1, bytes: 5 });
    expect(progress).toContain('people/p1/drive/a.txt');
    const file = (await manifestOf()).find((entry) => entry.path === 'people/p1/drive/a.txt');
    expect(file).toMatchObject({
      kind: 'file',
      area: 'people',
      size: 5,
      stable: true,
      sha256: createHash('sha256').update('alpha').digest('hex'),
    });
    expect(await readMoveMarker(target)).toEqual({ moveId: MOVE_ID, rootId: ROOT_ID });
    await expect(lstat(join(target, MOVE_DIRECTORY, 'manifest.jsonl'))).resolves.toBeDefined();
  });

  it('detects a file that changed during the copy', async () => {
    const summary = await copyHubEntries(
      options({
        operations: {
          copyFile: async (from, to, mode) => {
            await copyFile(from, to, mode);
            await appendFile(from, ' and more');
          },
        },
      }),
    );
    const file = (await manifestOf()).find((entry) => entry.path === 'people/p1/drive/a.txt');
    expect(file?.stable).toBe(false);
    expect(summary.unstable).toBe(1);
  });

  it('counts old-root prefixes in file contents and symlink targets', async () => {
    await writeFile(join(source, 'people/p1/drive/refs.txt'), `at ${source}/system and ${source}`);
    await symlink(`${source}/people`, join(source, 'home-link'));
    await mkdir(join(source, 'home'));
    await symlink(`${source}/people`, join(source, 'home/link'));
    const summary = await copyHubEntries(options());
    const entries = await manifestOf();
    expect(entries.find((entry) => entry.path === 'people/p1/drive/refs.txt')?.prefixHits).toBe(2);
    expect(entries.find((entry) => entry.path === 'home/link')).toMatchObject({
      kind: 'symlink',
      prefixHits: 1,
    });
    expect(await readlink(join(target, 'home/link'))).toBe(`${source}/people`);
    expect(summary.prefixHits).toBe(3);
    expect(summary.links).toBe(1);
  });

  it('resumes without recopying files that already match', async () => {
    await copyHubEntries(options());
    const copied: string[] = [];
    await copyHubEntries(
      options({
        operations: {
          copyFile: (from, to, mode) => {
            copied.push(from);
            return copyFile(from, to, mode);
          },
        },
      }),
    );
    expect(copied).toEqual([]);
    expect((await manifestOf()).some((entry) => entry.kind === 'file')).toBe(true);
  });

  it('asks for a clone copy', async () => {
    const modes: number[] = [];
    await copyHubEntries(
      options({
        operations: {
          copyFile: (from, to, mode) => {
            modes.push(mode);
            return copyFile(from, to, mode);
          },
        },
      }),
    );
    expect(modes).toEqual([constants.COPYFILE_FICLONE]);
  });

  it('stops when aborted', async () => {
    const controller = new AbortController();
    controller.abort(new Error('cancelled'));
    await expect(copyHubEntries(options({ signal: controller.signal }))).rejects.toThrow(
      'cancelled',
    );
  });
});
