import { stat } from 'node:fs/promises';
import { basename, dirname, isAbsolute, join } from 'node:path';
import type { ProviderFileMatches } from '@smarteverything/domain';
import { isMissing } from '../../fs-util';
import { rankMatches } from '../../references/rank';
import { ProviderInputError } from './input';
import { listProjectFiles, type FileListing } from './file-listing';

const PATH_MAX = 300;
export const LISTING_FRESH_MS = 3000;

interface Search {
  readonly cwd: string;
  readonly query: string;
  readonly limit: number;
}
type Entry = ProviderFileMatches['entries'][number];

interface Candidates {
  readonly paths: readonly string[];
  readonly truncated: boolean;
}

interface Remembered {
  readonly at: number;
  readonly candidates: Promise<Candidates>;
}

export class ProjectFileSearch {
  private readonly remembered = new Map<string, Remembered>();

  constructor(private readonly now: () => number = Date.now) {}

  async search(search: Search): Promise<ProviderFileMatches> {
    const { cwd, query, limit } = search;
    if (!isAbsolute(cwd) || !(await stat(cwd)).isDirectory())
      throw new ProviderInputError(
        'The project folder must be an existing absolute directory on this computer.',
      );
    const candidates = await this.candidatesOf(cwd);
    const matches = rankMatches(candidates.paths, query, (path) => ({
      title: basename(path),
      extra: path,
    }));
    const ranked = query === '' ? matches.sort(shallowFirst) : matches;
    const entries = await Promise.all(ranked.slice(0, limit).map((path) => entry(cwd, path)));
    return {
      entries: entries.filter((item) => item !== null),
      incomplete: candidates.truncated || ranked.length > limit,
    };
  }

  private candidatesOf(cwd: string): Promise<Candidates> {
    const now = this.now();
    for (const [folder, kept] of this.remembered)
      if (now - kept.at >= LISTING_FRESH_MS) this.remembered.delete(folder);
    const known = this.remembered.get(cwd);
    if (known !== undefined) return known.candidates;
    const candidates = this.load(cwd);
    this.remembered.set(cwd, { at: now, candidates });
    return candidates;
  }

  private async load(cwd: string): Promise<Candidates> {
    try {
      return candidatesOf(await listProjectFiles(cwd));
    } catch (cause) {
      this.remembered.delete(cwd);
      throw cause;
    }
  }
}

function candidatesOf(listing: FileListing): Candidates {
  return { paths: withDirectories(listing.files), truncated: listing.truncated };
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
