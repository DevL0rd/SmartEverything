import { createHash, type Hash } from 'node:crypto';
import { existsSync, lstatSync, readFileSync, readlinkSync, realpathSync } from 'node:fs';
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { gitSourceText, HubSourceError } from './hub-update-source.ts';

type IdentityPurpose = 'candidate' | 'watch';

function includesPath(parent: string, child: string): boolean {
  const path = relative(parent, child);
  return path !== '..' && !path.startsWith(`..${sep}`) && !isAbsolute(path);
}

export function isolatedCandidateRoot(source: string, candidate: string): string {
  const owner = realpathSync(source);
  const root = realpathSync(candidate);
  if (includesPath(owner, root) || includesPath(root, owner))
    throw new HubSourceError(
      'git',
      'The approved checkout must be separate from the source folder.',
    );
  if (!lstatSync(join(root, '.git')).isDirectory())
    throw new HubSourceError('git', 'The approved checkout needs its own Git directory.');
  return root;
}

function candidatePath(root: string, name: string): string {
  if (
    isAbsolute(name) ||
    name.includes('\uFFFD') ||
    name.split('/').some((part) => ['', '.', '..', '.git'].includes(part.toLowerCase()))
  ) {
    throw new HubSourceError('git', 'The approved checkout has an invalid Git path.');
  }
  return join(root, name);
}

function canonicalDestination(path: string): string {
  if (existsSync(path)) return realpathSync(path);
  const parent = dirname(path);
  if (parent === path)
    throw new HubSourceError('git', 'The approved build destination has no accessible root.');
  return join(canonicalDestination(parent), basename(path));
}

export function assertCandidateDestination(
  roots: readonly string[],
  output: string,
  replaces: boolean,
): void {
  if (!isAbsolute(output))
    throw new HubSourceError('git', 'The approved build destination must be absolute.');
  const destination = canonicalDestination(resolve(output));
  for (const root of roots.map((folder) => realpathSync(folder))) {
    if (includesPath(root, destination) || (replaces && includesPath(destination, root)))
      throw new HubSourceError('git', 'The approved build must stage outside both checkouts.');
  }
}

function assertCandidatePath(root: string, path: string): void {
  let resolved: string;
  try {
    resolved = realpathSync(path);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.name : typeof cause;
    throw new HubSourceError(
      'changed',
      `An approved file or link target could not be read (${reason}).`,
    );
  }
  if (!includesPath(root, resolved) || includesPath(join(root, '.git'), resolved))
    throw new HubSourceError('git', 'An approved file points outside its isolated checkout.');
}

function hashPath(hash: Hash, root: string, name: string, purpose: IdentityPurpose): void {
  const path = candidatePath(root, name);
  assertCandidatePath(root, path);
  const stat = lstatSync(path);
  if (purpose === 'watch') hash.update(JSON.stringify([stat.ino, stat.mtimeMs, stat.ctimeMs]));
  if (stat.isSymbolicLink()) {
    const target = readlinkSync(path);
    if (isAbsolute(target))
      throw new HubSourceError('git', 'An approved link must be relative to its checkout.');
    hash.update(JSON.stringify([name, 'link', target]));
  } else if (stat.isFile()) {
    hash.update(JSON.stringify([name, stat.mode, stat.size]));
    hash.update(readFileSync(path));
  } else {
    throw new HubSourceError('git', 'The approved checkout has a non-file Git entry.');
  }
}

export async function candidateIdentity(
  root: string,
  purpose: IdentityPurpose = 'candidate',
): Promise<string> {
  const files = await gitSourceText(
    root,
    ['ls-files', '--cached', '--others', '--exclude-standard', '--deduplicate', '-z'],
    'list the approved files',
  );
  const deleted = await gitSourceText(root, ['ls-files', '--deleted', '-z'], 'list removed files');
  const removed = new Set(deleted.split('\0'));
  const hash = createHash('sha256');
  for (const name of [...new Set(files.split('\0'))].sort()) {
    if (name.length === 0) continue;
    if (removed.has(name)) {
      candidatePath(root, name);
      hash.update(JSON.stringify([name, 'removed']));
    } else hashPath(hash, root, name, purpose);
  }
  return hash.digest('hex');
}
