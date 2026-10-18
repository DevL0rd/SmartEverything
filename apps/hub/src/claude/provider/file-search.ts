import { stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import type { ProviderFileMatches } from '@smarteverything/domain';
import { isMissing } from '../../fs-util';
import { rankMatches } from '../../references/rank';
import { ProviderInputError } from './input';
import { listProjectFiles } from './file-listing';

const PATH_MAX = 300;

interface Search {
  readonly cwd: string;
  readonly query: string;
  readonly limit: number;
}
type Entry = ProviderFileMatches['entries'][number];

export async function searchProjectFiles(search: Search): Promise<ProviderFileMatches> {
  const { cwd, query, limit } = search;
  if (!isAbsolute(cwd) || !(await stat(cwd)).isDirectory())
    throw new ProviderInputError(
      'The project folder must be an existing absolute directory on this computer.',
    );
  const listing = await listProjectFiles(cwd);
  const matches = rankMatches(withDirectories(listing.files), query, (path) => ({
    title: basename(path),
    extra: path,
  }));
  const ranked = query === '' ? matches.sort(shallowFirst) : matches;
  const entries = await Promise.all(ranked.slice(0, limit).map((path) => entry(cwd, path)));
  return {
    entries: entries.filter((item) => item !== null),
    incomplete: listing.truncated || ranked.length > limit,
  };
}

function withDirectories(files: readonly string[]): readonly string[] {
  const directories = new Set<string>();
  for (const file of files)
    for (let parent = dirname(file); parent !== '.'; parent = dirname(parent))
      directories.add(parent);
  return [...files, ...directories].filter(
    (path) => path.length <= PATH_MAX && !path.includes('\\'),
  );
}

function shallowFirst(left: string, right: string): number {
  return depth(left) - depth(right) || left.localeCompare(right);
}

function depth(path: string): number {
  return path.split('/').length;
}

async function entry(cwd: string, path: string): Promise<Entry | null> {
  try {
    const info = await stat(join(cwd, path));
    if (!info.isFile() && !info.isDirectory()) return null;
    return {
      path,
      entry_kind: info.isDirectory() ? 'directory' : 'file',
      version: `${String(info.mtimeMs)}-${String(info.size)}`,
    };
  } catch (cause) {
    if (isMissing(cause)) return null;
    throw cause;
  }
}
