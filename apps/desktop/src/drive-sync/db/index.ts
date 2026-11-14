import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import type { Logger } from '@smarteverything/logging';
import { CursorsRepository } from './cursors.js';
import { FilesRepository } from './files.js';
import { migrateClient } from './migrate.js';
import { CLIENT_MIGRATIONS } from './migrations.js';
import { PendingOpsRepository } from './pending-ops.js';
import { PlacementsRepository } from './placements.js';
import { PinsRepository, ExclusionsRepository } from './paths.js';
import { ClientSql } from './sql.js';
import { TransfersRepository } from './transfers.js';

export const DRIVE_SYNC_DATABASE_FILE = 'drive-sync.sqlite';

const BUSY_TIMEOUT_MS = 5000;

export interface DriveSyncDatabase {
  readonly files: FilesRepository;
  readonly cursors: CursorsRepository;
  readonly pendingOps: PendingOpsRepository;
  readonly transfers: TransfersRepository;
  readonly exclusions: ExclusionsRepository;
  readonly pins: PinsRepository;
  readonly placements: PlacementsRepository;
  readonly transaction: <T>(work: () => T) => T;
  readonly close: () => void;
}

export function openDriveSyncDatabase(path: string, log: Logger): DriveSyncDatabase {
  mkdirSync(dirname(path), { recursive: true });
  const database = new DatabaseSync(path, { enableForeignKeyConstraints: true });
  try {
    database.exec(`pragma busy_timeout = ${String(BUSY_TIMEOUT_MS)}`);
    database.exec('pragma journal_mode = wal');
    database.exec('pragma synchronous = normal');
    migrateClient(database, CLIENT_MIGRATIONS, log);
  } catch (cause) {
    database.close();
    throw cause;
  }
  const sql = new ClientSql(database);
  return {
    files: new FilesRepository(sql),
    cursors: new CursorsRepository(sql),
    pendingOps: new PendingOpsRepository(sql),
    transfers: new TransfersRepository(sql),
    exclusions: new ExclusionsRepository(sql),
    pins: new PinsRepository(sql),
    placements: new PlacementsRepository(sql),
    transaction: <T>(work: () => T): T => sql.transaction(work),
    close: (): void => {
      if (database.isOpen) database.close();
    },
  };
}

export type { FileInput, FileRecord } from './files.js';
export type { Cursor } from './cursors.js';
export type { PendingOp } from './pending-ops.js';
export type { Transfer } from './transfers.js';
export { ClientSchemaTooNewError } from './migrate.js';
