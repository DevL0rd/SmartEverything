import { constants } from 'node:fs';
import { lstat, mkdir, open, opendir } from 'node:fs/promises';
import { dirname, isAbsolute, join, parse, relative, resolve, sep } from 'node:path';
import { HarnessRuntimeError } from '../host/errors';
import { MAX_SKILL_ASSET_BYTES } from './skill-asset-format';

export async function confinedSkillDirectory(path: string, create: boolean): Promise<void> {
  if (
    !isAbsolute(path) ||
    path.includes('\0') ||
    resolve(path) !== path ||
    parse(path).root === path
  )
    throw new HarnessRuntimeError(
      'operation_failed',
      'Skill cache must name a normalized absolute directory beneath an existing filesystem root.',
    );
  const root = parse(path).root;
  let parent = root;
  for (const segment of relative(root, path).split(sep)) {
    parent = join(parent, segment);
    if (create) await mkdir(parent, { mode: 0o700 }).catch(allowExistingDirectory);
    const info = await lstat(parent);
    if (info.isSymbolicLink() || !info.isDirectory())
      throw new HarnessRuntimeError(
        'operation_failed',
        'Skill cache paths cannot contain symbolic links or non-directories.',
      );
  }
}

export async function readSkillCacheFile(path: string): Promise<Buffer> {
  await confinedSkillDirectory(dirname(path), false);
  const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const info = await handle.stat();
    if (!info.isFile() || info.size > MAX_SKILL_ASSET_BYTES)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Skill cache file type or size violates the bounded artifact contract.',
      );
    const bytes = Buffer.alloc(info.size + 1);
    let size = 0;
    while (size < bytes.byteLength) {
      const read = await handle.read(bytes, size, bytes.byteLength - size, null);
      if (read.bytesRead === 0) break;
      size += read.bytesRead;
    }
    if (size !== info.size)
      throw new HarnessRuntimeError(
        'operation_failed',
        'Skill cache file changed size during the bounded read.',
      );
    return bytes.subarray(0, size);
  } finally {
    await handle.close();
  }
}

export async function assertSkillCacheMembers(
  root: string,
  paths: readonly string[],
): Promise<void> {
  const allowed = new Set(paths);
  for (const path of paths) {
    let parent = dirname(path);
    while (parent !== '.') {
      allowed.add(parent);
      parent = dirname(parent);
    }
  }
  await inspectSkillCacheMembers(root, root, allowed);
}

async function inspectSkillCacheMembers(
  root: string,
  directory: string,
  allowed: ReadonlySet<string>,
): Promise<void> {
  for await (const entry of await opendir(directory)) {
    const path = join(directory, entry.name);
    if (entry.isSymbolicLink() || !allowed.has(relative(root, path)))
      throw new HarnessRuntimeError(
        'composition_incompatible',
        'Skill cache contains an unexpected member or symbolic link.',
      );
    if (entry.isDirectory()) await inspectSkillCacheMembers(root, path, allowed);
    else if (!entry.isFile())
      throw new HarnessRuntimeError(
        'composition_incompatible',
        'Skill cache member must be a regular file or directory.',
      );
  }
}

function allowExistingDirectory(error: unknown): void {
  if (!(error instanceof Error && 'code' in error && error.code === 'EEXIST')) throw error;
}

export function isMissingSkillCache(error: unknown): boolean {
  return error instanceof Error && 'code' in error && error.code === 'ENOENT';
}
