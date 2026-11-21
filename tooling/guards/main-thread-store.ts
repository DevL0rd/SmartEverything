import { readFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { z } from 'zod';
import { filesUnder, repositoryRoot } from './repository-files';

const SOURCE = join(repositoryRoot, 'apps', 'hub', 'src');
const STORE = join(SOURCE, 'store');

export const MAIN_THREAD_STORE_LIST = join(import.meta.dirname, 'no-main-thread-store.json');

const SYNC_USES: readonly RegExp[] = [
  /\bstore\.(?!host\b|feed\b|reader\b|now\b|context\b)[a-z]\w*\.[a-z]\w*\(/g,
  /\bsql\.(?:all|get|run|returning|transaction)\(/g,
  /\.(?:write|durableWrite|transaction)\(\(\) =>/g,
  /\bnew DatabaseSync\(/g,
];

export const MAIN_THREAD_STORE = z.strictObject({
  hosted: z.array(z.string()),
  remaining: z.record(z.string(), z.int().positive()),
});

export type MainThreadStore = z.output<typeof MAIN_THREAD_STORE>;

function posix(path: string): string {
  return relative(repositoryRoot, path).replace(/\\/g, '/');
}

function usesIn(text: string): number {
  return SYNC_USES.reduce((total, pattern) => total + (text.match(pattern)?.length ?? 0), 0);
}

function sorted(record: Readonly<Record<string, number>>): Record<string, number> {
  return Object.fromEntries(Object.entries(record).sort(([a], [b]) => a.localeCompare(b)));
}

export function readMainThreadStore(): MainThreadStore {
  return MAIN_THREAD_STORE.parse(JSON.parse(readFileSync(MAIN_THREAD_STORE_LIST, 'utf8')));
}

export function mainThreadStoreUses(hosted: ReadonlySet<string>): Record<string, number> {
  const found: Record<string, number> = {};
  for (const file of filesUnder(SOURCE)) {
    if (!file.endsWith('.ts') || file.startsWith(`${STORE}/`)) continue;
    const path = posix(file);
    if (hosted.has(path)) continue;
    const uses = usesIn(readFileSync(file, 'utf8'));
    if (uses > 0) found[path] = uses;
  }
  const store = join(STORE, 'store.ts');
  const opened = usesIn(readFileSync(store, 'utf8'));
  if (opened > 0) found[posix(store)] = opened;
  return sorted(found);
}

export function sortedUses(record: Readonly<Record<string, number>>): Record<string, number> {
  return sorted(record);
}
