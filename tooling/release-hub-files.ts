import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  renameSync,
  rmSync,
  statfsSync,
  statSync,
} from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { pathToFileURL } from 'node:url';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';

const ROOT = join(import.meta.dirname, '..');

export const DATABASE_FILE = 'smarteverything.db';
export const SERVICE_ENTRY = 'service.mjs';
export const SERVICE_FILES = [SERVICE_ENTRY, 'voice-worker.mjs', 'hook-helper.mjs'] as const;

const STORE_MODULE = join(ROOT, 'apps', 'hub', 'src', 'store', 'store.ts');
const FREE_SPACE_FACTOR = 3;

export interface HubLayout {
  readonly service: string;
  readonly database: string;
  readonly data: string;
  readonly backups: string;
}

export class ReleaseStepError extends Error {
  override readonly name = 'ReleaseStepError';

  constructor(
    readonly step: string,
    reason: string,
  ) {
    super(`${step}: ${reason}`);
  }
}

export function hubLayout(install?: string, data?: string): HubLayout {
  const installed = install ?? join(homedir(), '.local', 'opt', 'SmartEverything');
  const stored = data ?? join(homedir(), '.config', 'SmartEverything');
  return {
    service: join(installed, 'resources', 'service'),
    database: join(stored, DATABASE_FILE),
    data: stored,
    backups: join(stored, 'release-backups'),
  };
}

export function builtServiceProblems(directory: string): readonly string[] {
  return SERVICE_FILES.filter((file) => !existsSync(join(directory, file))).map(
    (file) => `${join(directory, file)} is missing; build it with tooling/build-service.ts first`,
  );
}

export function vacuumInto(source: string, target: string): void {
  const database = new DatabaseSync(source, { readOnly: true });
  try {
    database.prepare('vacuum into $path').run({ path: target });
  } finally {
    database.close();
  }
}

export function schemaVersionOf(database: string): number {
  const opened = new DatabaseSync(database, { readOnly: true });
  try {
    const row = z
      .object({ version: z.number().int().nullable() })
      .parse(opened.prepare('select max(version) as version from schema_version').get());
    return row.version ?? 0;
  } finally {
    opened.close();
  }
}

export function freeSpaceProblem(layout: HubLayout): string | null {
  const needed = statSync(layout.database).size * FREE_SPACE_FACTOR;
  mkdirSync(layout.data, { recursive: true });
  const stats = statfsSync(layout.data);
  const free = stats.bavail * stats.bsize;
  return free >= needed
    ? null
    : `only ${String(Math.floor(free / 1e6))} MB are free in ${layout.data}, a release needs ${String(Math.ceil(needed / 1e6))} MB`;
}

export function backUpRelease(layout: HubLayout, name: string, epoch: number): string {
  const directory = join(layout.backups, `${name}-${String(epoch)}`);
  mkdirSync(directory, { recursive: true });
  cpSync(layout.service, join(directory, 'service'), { recursive: true, verbatimSymlinks: true });
  vacuumInto(layout.database, join(directory, DATABASE_FILE));
  return directory;
}

export function swapService(layout: HubLayout, built: string, name: string): string {
  const aside = `${layout.service}.old-${name}`;
  rmSync(aside, { recursive: true, force: true });
  renameSync(layout.service, aside);
  try {
    cpSync(built, layout.service, { recursive: true, verbatimSymlinks: true });
  } catch (cause) {
    rmSync(layout.service, { recursive: true, force: true });
    renameSync(aside, layout.service);
    throw new ReleaseStepError('swap', cause instanceof Error ? cause.message : String(cause));
  }
  return aside;
}

export function restoreService(layout: HubLayout, backup: string, stamp: string): void {
  renameSync(layout.service, `${layout.service}.rolled-back-${stamp}`);
  cpSync(join(backup, 'service'), layout.service, { recursive: true, verbatimSymlinks: true });
}

export function restoreDatabase(layout: HubLayout, backup: string, stamp: string): void {
  for (const suffix of ['', '-wal', '-shm']) {
    const live = `${layout.database}${suffix}`;
    if (existsSync(live)) renameSync(live, `${live}.rolled-back-${stamp}`);
  }
  cpSync(join(backup, DATABASE_FILE), layout.database);
}

const OPEN_STORE = z.object({
  openStore: z.custom<(options: StoreOptions) => { readonly close: () => void }>(
    (value) => typeof value === 'function',
  ),
});

interface StoreOptions {
  readonly path: string;
  readonly log: Logger;
  readonly now: () => Date;
  readonly systemTimeZone: string;
}

export interface MigrationCheck {
  readonly from: number;
  readonly to: number;
}

export async function checkMigrations(layout: HubLayout): Promise<MigrationCheck> {
  const { openStore } = OPEN_STORE.parse(await import(pathToFileURL(STORE_MODULE).href));
  const scratch = mkdtempSync(join(tmpdir(), 'release-migration-'));
  const copy = join(scratch, DATABASE_FILE);
  try {
    vacuumInto(layout.database, copy);
    const from = schemaVersionOf(copy);
    const [first = 0, second = 0] = [1, 2].map((pass) => {
      const store = openStore({
        path: copy,
        log: new Logger(`tool.release-migration-pass-${String(pass)}`),
        now: () => new Date(),
        systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      });
      store.close();
      return schemaVersionOf(copy);
    });
    if (first !== second) {
      throw new ReleaseStepError(
        'migration check',
        `a second open moved the schema from ${String(first)} to ${String(second)}, so the migrations are not idempotent`,
      );
    }
    return { from, to: first };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
