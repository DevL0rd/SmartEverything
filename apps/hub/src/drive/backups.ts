import { mkdir, open, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { backup, DatabaseSync } from 'node:sqlite';
import {
  DRIVE_ROOT_KINDS,
  type DriveBackupReport,
  type DriveBackupReportInput,
  type DriveBackupStatus,
  type DriveRoot,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { fsCode } from '../fs-code';
import type { DriveBackupsRepository } from '../store/repositories/drive-backups';
import type { DriveItemsRepository } from '../store/repositories/drive-items';
import type { DriveRootsRepository } from '../store/repositories/drive-roots';
import type { DriveTrashRepository } from '../store/repositories/drive-trash';

export const BACKUP_DATABASE_FILE = 'smarteverything.sqlite';
export const BACKUP_MANIFEST_FILE = 'drive-manifest.jsonl';

const COPY_PAGES_PER_STEP = 100;
const WINDOW_ROWS = 1000;

const ID = z.string().min(1);
const COUNT = z.int().nonnegative();
const MOMENT = z.iso.datetime({ offset: true });

export const BACKUP_MANIFEST_LINE = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('root'),
    rootId: ID,
    label: ID,
    rootKind: z.enum(DRIVE_ROOT_KINDS),
    indexId: ID,
  }),
  z.strictObject({
    kind: z.literal('file'),
    rootId: ID,
    relPath: ID,
    bytes: COUNT,
    sha256: z
      .string()
      .regex(/^[0-9a-f]{64}$/)
      .nullable(),
    modifiedAt: MOMENT,
  }),
  z.strictObject({
    kind: z.literal('trash'),
    rootId: ID,
    itemId: ID,
    originalRelPath: ID,
    trashRelPath: ID,
    isFolder: z.boolean(),
    bytes: COUNT,
    deletedAt: MOMENT,
  }),
]);

export type BackupManifestLine = z.infer<typeof BACKUP_MANIFEST_LINE>;

export interface BackupEnvironment {
  readonly database: DatabaseSync;
  readonly store: {
    readonly driveRoots: Pick<DriveRootsRepository, 'list' | 'update'>;
    readonly driveItems: Pick<DriveItemsRepository, 'children'>;
    readonly driveTrash: Pick<DriveTrashRepository, 'inRoot'>;
    readonly driveBackups: Pick<DriveBackupsRepository, 'record' | 'status'>;
  };
  readonly log: Logger;
}

export interface DriveSnapshot {
  readonly database: string;
  readonly manifest: string;
  readonly bytes: number;
  readonly files: number;
}

export class BackupCopyError extends Error {
  override readonly name = 'BackupCopyError';
}

type PhysicalRoot = DriveRoot & { readonly path: string };

function physical(root: DriveRoot): PhysicalRoot | null {
  return root.path === null ? null : { ...root, path: root.path };
}

function lineOf(line: BackupManifestLine): string {
  return `${JSON.stringify(BACKUP_MANIFEST_LINE.parse(line))}\n`;
}

function* fileLines(
  items: BackupEnvironment['store']['driveItems'],
  rootId: string,
): Generator<readonly BackupManifestLine[]> {
  const pending: (string | null)[] = [null];
  for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
    let after: string | null = null;
    do {
      const window = items.children(rootId, parent, after, WINDOW_ROWS);
      const lines: BackupManifestLine[] = [];
      for (const { item } of window.entries) {
        if (item.kind === 'folder') pending.push(item.id);
        else {
          lines.push({
            kind: 'file',
            rootId,
            relPath: item.relPath,
            bytes: item.bytes,
            sha256: item.sha256,
            modifiedAt: item.modifiedAt,
          });
        }
      }
      yield lines;
      after = window.next;
    } while (after !== null);
  }
}

function* trashLines(
  trash: BackupEnvironment['store']['driveTrash'],
  rootId: string,
): Generator<readonly BackupManifestLine[]> {
  let after: Parameters<BackupEnvironment['store']['driveTrash']['inRoot']>[1] = null;
  do {
    const window = trash.inRoot(rootId, after, WINDOW_ROWS);
    yield window.entries.map((entry): BackupManifestLine => ({
      kind: 'trash',
      rootId,
      itemId: entry.itemId,
      originalRelPath: entry.originalRelPath,
      trashRelPath: entry.trashRelPath,
      isFolder: entry.isFolder,
      bytes: entry.bytes,
      deletedAt: entry.deletedAt,
    }));
    after = window.next;
  } while (after !== null);
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path);
    return true;
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return false;
    throw cause;
  }
}

function integrityOf(path: string): string {
  const copy = new DatabaseSync(path, { readOnly: true });
  try {
    const row = z
      .object({ integrity_check: z.string() })
      .parse(copy.prepare('pragma integrity_check').get());
    return row.integrity_check;
  } finally {
    copy.close();
  }
}

export class DriveBackups {
  constructor(private readonly env: BackupEnvironment) {}

  async snapshot(directory: string): Promise<DriveSnapshot> {
    await mkdir(directory, { recursive: true, mode: 0o700 });
    const database = join(directory, BACKUP_DATABASE_FILE);
    const manifest = join(directory, BACKUP_MANIFEST_FILE);
    await this.copyDatabase(database);
    const files = await this.writeManifest(manifest);
    const bytes = (await stat(database)).size + (await stat(manifest)).size;
    this.env.log.info('drive.backup_snapshot', { files, bytes });
    return { database, manifest, bytes, files };
  }

  report(input: DriveBackupReportInput): DriveBackupReport {
    const report = this.env.store.driveBackups.record(input);
    if (report.ok) {
      for (const root of this.env.store.driveRoots.list()) {
        this.env.store.driveRoots.update(root.id, {
          health: { ...root.health, lastBackupAt: report.at },
        });
      }
    }
    this.env.log.info('drive.backup_reported', {
      reporter: report.reporter,
      bytes: report.bytes,
      ok: report.ok,
    });
    return report;
  }

  status(): DriveBackupStatus {
    return this.env.store.driveBackups.status();
  }

  unprotectedRoots(): readonly DriveRoot[] {
    return this.env.store.driveRoots
      .list()
      .filter((root) => physical(root) !== null && root.health.lastBackupAt === null);
  }

  private async copyDatabase(target: string): Promise<void> {
    if (await exists(target)) {
      throw new BackupCopyError(`${target} already exists; a backup never overwrites a file.`);
    }
    await backup(this.env.database, target, {
      rate: COPY_PAGES_PER_STEP,
      progress: ({ totalPages, remainingPages }) => {
        this.env.log.debug('drive.backup_progress', { totalPages, remainingPages });
      },
    });
    const verdict = integrityOf(target);
    if (verdict !== 'ok') {
      await rm(target, { force: true });
      throw new BackupCopyError(`The database copy failed its integrity check: ${verdict}`);
    }
  }

  private async writeManifest(target: string): Promise<number> {
    const handle = await open(target, 'wx', 0o600);
    let files = 0;
    try {
      for (const root of this.env.store.driveRoots.list()) {
        const found = physical(root);
        if (found === null) continue;
        await handle.write(
          lineOf({
            kind: 'root',
            rootId: found.id,
            label: found.label,
            rootKind: found.kind,
            indexId: found.indexId,
          }),
        );
        files += await this.writeLines(handle, fileLines(this.env.store.driveItems, found.id));
        await this.writeLines(handle, trashLines(this.env.store.driveTrash, found.id));
      }
    } finally {
      await handle.close();
    }
    return files;
  }

  private async writeLines(
    handle: Awaited<ReturnType<typeof open>>,
    windows: Generator<readonly BackupManifestLine[]>,
  ): Promise<number> {
    let written = 0;
    for (const lines of windows) {
      if (lines.length === 0) continue;
      await handle.write(lines.map(lineOf).join(''));
      written += lines.length;
    }
    return written;
  }
}
