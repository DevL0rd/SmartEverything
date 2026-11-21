import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { BUNDLED_STORE_HOST } from '../store/host/script';
import { openStore } from '../store/store';

const COPY_FILE = 'migration-check.sqlite';
const VERSION_ROW = z.object({ version: z.number().int().nullable() });
const PASSES = 2;

export interface MigrationCheckResult {
  readonly from: number;
  readonly to: number;
}

export class MigrationCheckError extends Error {
  override readonly name = 'MigrationCheckError';
}

function schemaVersion(database: string): number {
  const opened = new DatabaseSync(database, { readOnly: true });
  try {
    const row = VERSION_ROW.parse(
      opened.prepare('select max(version) as version from schema_version').get(),
    );
    return row.version ?? 0;
  } finally {
    opened.close();
  }
}

function vacuumInto(source: string, target: string): void {
  const database = new DatabaseSync(source, { readOnly: true });
  try {
    database.prepare('vacuum into $path').run({ path: target });
  } finally {
    database.close();
  }
}

export function checkMigrationsOf(database: string, scratchRoot: string): MigrationCheckResult {
  mkdirSync(scratchRoot, { recursive: true, mode: 0o700 });
  const scratch = mkdtempSync(join(scratchRoot, 'release-migration-'));
  const copy = join(scratch, COPY_FILE);
  try {
    vacuumInto(database, copy);
    const from = schemaVersion(copy);
    const versions = Array.from({ length: PASSES }, (_, pass) => {
      const store = openStore({
        path: copy,
        log: new Logger(`hub.migration-check-pass-${String(pass + 1)}`),
        now: () => new Date(),
        systemTimeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        driveFolders: null,
        host: { script: BUNDLED_STORE_HOST, readers: 1 },
      });
      store.close();
      return schemaVersion(copy);
    });
    const [first = 0, second = 0] = versions;
    if (first !== second)
      throw new MigrationCheckError(
        `a second open moved the schema from ${String(first)} to ${String(second)}, so the migrations are not idempotent`,
      );
    return { from, to: first };
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}

export function runMigrationCheck(argv: readonly string[]): void {
  const [database, scratchRoot] = argv;
  if (database === undefined || scratchRoot === undefined)
    throw new MigrationCheckError('usage: migration-check.mjs <database> <scratch folder>');
  process.stdout.write(`${JSON.stringify(checkMigrationsOf(database, scratchRoot))}\n`);
}
