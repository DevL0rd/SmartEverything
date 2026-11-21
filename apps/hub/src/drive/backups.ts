import { mkdir, open, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { backup, type DatabaseSync } from 'node:sqlite';
import { integrityOf } from '../store/integrity';
import {
  DRIVE_ROOT_SCOPES,
  type DriveBackupReport,
  type DriveBackupReportInput,
  type DriveBackupStatus,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import { fsCode } from '../fs-code';
import type { StoredDrive } from '../store/repositories/drive-roots';
import type { DriveChildrenQuery, DriveItemWindow } from '../store/repositories/drive-items';
import type { DriveTrashCursor, DriveTrashWindow } from '../store/repositories/drive-trash';
import type { Store } from '../store/store';
import { isFileItem } from './file-item';

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
    scope: z.enum(DRIVE_ROOT_SCOPES),
    ownerProfileId: ID.nullable(),
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
  readonly store: BackupStore;
  readonly log: Logger;
}

export interface BackupStore {
  readonly roots: () => Promise<StoredDrive[]>;
  readonly children: (request: DriveChildrenQuery) => Promise<DriveItemWindow>;
  readonly trashInRoot: (
    rootId: string,
    after: DriveTrashCursor | null,
    limit: number,
  ) => Promise<DriveTrashWindow>;
  readonly report: (input: DriveBackupReportInput) => Promise<DriveBackupReport>;
  readonly status: () => Promise<DriveBackupStatus>;
}

export function hostBackupStore(store: Pick<Store, 'host'>): BackupStore {
  const { host } = store;
  return {
    roots: () => host.call('driveRoots', 'list'),
    children: (request) => host.call('driveItems', 'children', request),
    trashInRoot: (rootId, after, limit) => host.call('driveTrash', 'inRoot', rootId, after, limit),
    report: (input) => host.write('driveBackupReport', input),
    status: () => host.call('driveBackups', 'status'),
  };
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

function lineOf(line: BackupManifestLine): string {
  return `${JSON.stringify(BACKUP_MANIFEST_LINE.parse(line))}\n`;
}

async function* fileLines(
  store: BackupEnvironment['store'],
  rootId: string,
): AsyncGenerator<readonly BackupManifestLine[]> {
  const pending: (string | null)[] = [null];
  for (let parent = pending.pop(); parent !== undefined; parent = pending.pop()) {
    let after: string | null = null;
    do {
      const window = await store.children({
        rootId,
        parentId: parent,
        after,
        limit: WINDOW_ROWS,
        viewer: null,
      });
      const lines: BackupManifestLine[] = [];
      for (const { item } of window.entries) {
        if (item.kind === 'folder') pending.push(item.id);
        else if (isFileItem(item)) {
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

async function* trashLines(
  store: BackupEnvironment['store'],
  rootId: string,
): AsyncGenerator<readonly BackupManifestLine[]> {
  let after: DriveTrashCursor | null = null;
  do {
    const window = await store.trashInRoot(rootId, after, WINDOW_ROWS);
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

  async report(input: DriveBackupReportInput): Promise<DriveBackupReport> {
    const report = await this.env.store.report(input);
    this.env.log.info('drive.backup_reported', {
      reporter: report.reporter,
      bytes: report.bytes,
      ok: report.ok,
    });
    return report;
  }

  status(): Promise<DriveBackupStatus> {
    return this.env.store.status();
  }

  async unprotectedRoots(): Promise<readonly StoredDrive[]> {
    const roots = await this.env.store.roots();
    return roots.filter((root) => root.health.lastBackupAt === null);
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
    const verdict = await integrityOf(target);
    if (verdict !== 'ok') {
      await rm(target, { force: true });
      throw new BackupCopyError(`The database copy failed its integrity check: ${verdict}`);
    }
  }

  private async writeManifest(target: string): Promise<number> {
    const handle = await open(target, 'wx', 0o600);
    let files = 0;
    try {
      for (const root of await this.env.store.roots()) {
        await handle.write(
          lineOf({
            kind: 'root',
            rootId: root.id,
            scope: root.scope,
            ownerProfileId: root.ownerProfileId,
            indexId: root.indexId,
          }),
        );
        files += await this.writeLines(handle, fileLines(this.env.store, root.id));
        await this.writeLines(handle, trashLines(this.env.store, root.id));
      }
    } finally {
      await handle.close();
    }
    return files;
  }

  private async writeLines(
    handle: Awaited<ReturnType<typeof open>>,
    windows: AsyncGenerator<readonly BackupManifestLine[]>,
  ): Promise<number> {
    let written = 0;
    for await (const lines of windows) {
      if (lines.length === 0) continue;
      await handle.write(lines.map(lineOf).join(''));
      written += lines.length;
    }
    return written;
  }
}
