import { execFile } from 'node:child_process';
import { readdir } from 'node:fs/promises';
import { promisify } from 'node:util';

const run = promisify(execFile);
const GIT_BUFFER_BYTES = 256 * 1024 * 1024;
const NOT_A_REPOSITORY = 128;
const WALK_ENTRY_LIMIT = 100_000;
const SKIPPED_DIRECTORIES = new Set(['node_modules', 'target', 'dist', 'build', '__pycache__']);

export interface FileListing {
  readonly files: readonly string[];
  readonly truncated: boolean;
}

export async function listProjectFiles(cwd: string): Promise<FileListing> {
  const tracked = await gitFiles(cwd);
  return tracked === null ? walkFiles(cwd) : { files: tracked, truncated: false };
}

async function gitFiles(cwd: string): Promise<readonly string[] | null> {
  try {
    const { stdout } = await run(
      'git',
      ['-C', cwd, 'ls-files', '-z', '--cached', '--others', '--exclude-standard'],
      { maxBuffer: GIT_BUFFER_BYTES },
    );
    return stdout.split('\0').filter((path) => path !== '');
  } catch (cause) {
    if (isNoRepository(cause)) return null;
    throw cause;
  }
}

function isNoRepository(cause: unknown): boolean {
  if (!(cause instanceof Error) || !('code' in cause)) return false;
  return cause.code === 'ENOENT' || cause.code === NOT_A_REPOSITORY;
}

async function walkFiles(root: string): Promise<FileListing> {
  const files: string[] = [];
  const pending: string[] = [''];
  for (let directory = pending.pop(); directory !== undefined; directory = pending.pop()) {
    const entries = await readdir(directory === '' ? root : `${root}/${directory}`, {
      withFileTypes: true,
    });
    for (const entry of entries) {
      const path = directory === '' ? entry.name : `${directory}/${entry.name}`;
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && !SKIPPED_DIRECTORIES.has(entry.name)) pending.push(path);
      } else if (entry.isFile()) files.push(path);
      if (files.length >= WALK_ENTRY_LIMIT) return { files, truncated: true };
    }
  }
  return { files, truncated: false };
}
