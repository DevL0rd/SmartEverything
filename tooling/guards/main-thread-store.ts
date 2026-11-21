import { readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { z } from 'zod';
import { filesUnder, repositoryRoot } from './repository-files';

const SOURCE = join(repositoryRoot, 'apps', 'hub', 'src');
const STORE = join(SOURCE, 'store');

export const MAIN_THREAD_STORE_LIST = join(import.meta.dirname, 'no-main-thread-store.json');

const SYNC_USES: readonly RegExp[] = [
  /\bstore\.(?!host\b|feed\b|reader\b|now\b|context\b)[a-z]\w*\.[a-z]\w*\(/g,
  /\bsql\.(?:all|get|run|returning|transaction)\(/g,
  /\.(?:write|durableWrite|transaction)\(\(\) =>/g,
];

const DATABASE_OPEN = /\bnew DatabaseSync\(/g;

export const OFF_MAIN_DATABASES: Readonly<Record<string, string>> = {
  'apps/hub/src/store/host/host-store.ts': 'opened only by the store host worker threads',
  'apps/hub/src/store/reader.ts': 'inside the background reader worker source',
  'apps/hub/src/store/checkpoints.ts': 'inside the checkpoint worker source',
  'apps/hub/src/store/drive-sync-retention.ts': 'inside the sync history retention worker source',
  'apps/hub/src/store/integrity.ts': 'inside the integrity check worker source',
  'apps/hub/src/store/database-copy.ts': 'inside the database copy worker source',
  'apps/hub/src/logs/schema.ts': 'opened only by the runtime log worker threads',
  'apps/hub/src/self-update/migration-check.ts': 'runs in its own migration check process',
  'apps/hub/src/service/file-io-threads.ts':
    'read by the service launcher before the event loop starts, to size the libuv pool',
};

export const WORKER_ONLY_MODULES: Readonly<Record<string, readonly string[]>> = {
  'apps/hub/src/store/host/host-store.ts': ['apps/hub/src/store/host/worker.ts'],
  'apps/hub/src/logs/schema.ts': ['apps/hub/src/logs/worker.ts'],
};

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
  return sorted(found);
}

export function mainThreadDatabases(): readonly string[] {
  return filesUnder(SOURCE)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => posix(file))
    .filter(
      (path) =>
        !Object.hasOwn(OFF_MAIN_DATABASES, path) &&
        (readFileSync(join(repositoryRoot, path), 'utf8').match(DATABASE_OPEN)?.length ?? 0) > 0,
    )
    .sort();
}

function valueImportOf(importer: string, text: string, module: string): boolean {
  const target = module.replace(/\.ts$/, '');
  const imports = text.matchAll(/import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/g);
  for (const [, typeOnly, names = '', from = ''] of imports) {
    if (!from.startsWith('.')) continue;
    if (posix(join(repositoryRoot, dirname(importer), from)) !== target) continue;
    if (typeOnly !== undefined) continue;
    if (names.split(',').some((entry) => entry.trim() !== '' && !entry.trim().startsWith('type ')))
      return true;
  }
  return false;
}

export function workerModuleImporters(): Record<string, readonly string[]> {
  const files = filesUnder(SOURCE)
    .filter((file) => file.endsWith('.ts'))
    .map((file) => ({ path: posix(file), text: readFileSync(file, 'utf8') }));
  return Object.fromEntries(
    Object.keys(WORKER_ONLY_MODULES).map((module) => [
      module,
      files
        .filter(({ path, text }) => path !== module && valueImportOf(path, text, module))
        .map(({ path }) => path)
        .sort(),
    ]),
  );
}

export function sortedUses(record: Readonly<Record<string, number>>): Record<string, number> {
  return sorted(record);
}
