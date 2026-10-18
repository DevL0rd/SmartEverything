import { readdirSync, renameSync, rmSync, statSync } from 'node:fs';
import { basename, dirname, join } from 'node:path';
import { z } from 'zod';
import type { Logger } from '@smarteverything/logging';
import type { Sql } from './sql';
import { messageOf } from '@smarteverything/logging';

const KEPT_BACKUPS = 3;
const MAIN_DATABASE = z.object({ file: z.string() });

class MigrationBackupError extends Error {
  override readonly name = 'MigrationBackupError';

  constructor(
    readonly path: string,
    override readonly cause: unknown,
  ) {
    super(
      `The database could not be backed up to ${path} before migrating, so nothing was migrated: ${messageOf(cause)}.`,
    );
  }
}

function escaped(text: string): string {
  return text.replaceAll(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);
}

function prune(database: string): void {
  const pattern = new RegExp(`^${escaped(basename(database))}\\.v(\\d+)-before-v(\\d+)\\.sqlite$`);
  const backups = readdirSync(dirname(database))
    .flatMap((name) => {
      const match = pattern.exec(name);
      return match === null ? [] : [{ name, from: Number(match[1]), to: Number(match[2]) }];
    })
    .toSorted((a, b) => b.to - a.to || b.from - a.from);
  for (const stale of backups.slice(KEPT_BACKUPS)) {
    rmSync(join(dirname(database), stale.name), { force: true });
  }
}

export function backUpBeforeMigrating(sql: Sql, from: number, to: number, log: Logger): void {
  const database = sql.get(
    MAIN_DATABASE,
    "select file from pragma_database_list where name = 'main'",
  )?.file;
  if (database === undefined || database === '') return;
  const path = `${database}.v${String(from)}-before-v${String(to)}.sqlite`;
  const partial = `${path}.partial`;
  const startedAt = performance.now();
  log.info('store.backup_started', { file: basename(path), from, to });
  try {
    rmSync(partial, { force: true });
    sql.run('back up the database', 'vacuum into $path', { path: partial });
    renameSync(partial, path);
    prune(database);
  } catch (cause) {
    rmSync(partial, { force: true });
    log.error('store.backup_failed', cause, {
      file: basename(path),
      from,
      to,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw new MigrationBackupError(path, cause);
  }
  log.info('store.backed_up', {
    path,
    from,
    to,
    bytes: statSync(path).size,
    durationMs: Math.round(performance.now() - startedAt),
  });
}
