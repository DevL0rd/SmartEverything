import { execFile } from 'node:child_process';
import { mkdir, open, rename, writeFile } from 'node:fs/promises';
import { promisify } from 'node:util';
import { dirname } from 'node:path';

export async function writeUnsynced(path: string, temporary: string, text: string): Promise<void> {
  await mkdir(dirname(temporary), { recursive: true, mode: 0o700 });
  await writeFile(temporary, text, { mode: 0o600, flag: 'wx' });
  await rename(temporary, path);
}

const run = promisify(execFile);

export const PARALLEL_SYNCS = 16;

async function syncEach(paths: readonly string[]): Promise<void> {
  await Promise.all(paths.map((path) => syncDirectory(path)));
}

async function syncFilesystemsOf(paths: readonly string[]): Promise<void> {
  await run('sync', ['-f', '--', ...new Set(paths.map((path) => dirname(path)))]);
}

export async function syncPaths(paths: readonly string[]): Promise<void> {
  const distinct = [...new Set(paths)];
  if (distinct.length === 0) return;
  if (distinct.length <= PARALLEL_SYNCS) await syncEach(distinct);
  else await syncFilesystemsOf(distinct);
}

export async function syncDirectory(path: string): Promise<void> {
  const handle = await open(path, 'r');
  try {
    await handle.sync();
  } finally {
    await handle.close();
  }
}

export async function stageEmptyFile(path: string): Promise<void> {
  const handle = await open(path, 'wx', 0o600);
  await handle.close();
}
