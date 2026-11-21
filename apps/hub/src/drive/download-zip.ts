import type { DriveItemWindow } from '../store/repositories/drive-items';
import {
  ApiError,
  DRIVE_DOWNLOAD,
  type DownloadSkipped,
  type DriveDownload,
  type DriveItem,
  type MediaLink,
} from '@smarteverything/domain';
import { Logger, messageOf } from '@smarteverything/logging';
import { constants } from 'node:fs';
import { access, stat } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { Store } from '../store/store';
import type { StoredDrive } from '../store/repositories/drive-roots';
import type { ZipEntry } from '../zip/zip-stream';
import { inLockedFolder, mayExport, type DriveActor } from './access';
import { isFileItem } from './file-item';
import { resolveInRoot } from './paths';
import type { DriveReadService } from './service-read';
import { DRIVE_PAGE_SIZE } from './page-size';
import { viewOnlyRefusal } from './sharing/export-guard';

const log = new Logger('hub.drive-download');
const SKIPPED_NAME = 'Not included.txt';
const FOLDER_MODE = 0o40755;
const PACKED = /\.(zip|gz|tgz|bz2|xz|zst|7z|rar|jar|apk)$/i;
const PACKED_KINDS: ReadonlySet<DriveItem['kind']> = new Set(['image', 'video', 'audio']);

export interface DriveDownloadDeps {
  readonly store: Pick<Store, 'host'>;
  readonly read: Pick<DriveReadService, 'readItemAndRoot'>;
  readonly links: {
    readonly driveDownload: (itemId: string, rev: number) => MediaLink;
    readonly driveDownloadTicket: (ticketId: string) => MediaLink;
  };
  readonly now: () => Date;
  readonly newId: () => string;
}

export interface DriveZipTicket {
  readonly name: string;
  readonly entries: readonly ZipEntry[];
}

interface Held extends DriveZipTicket {
  readonly expiresAt: number;
}

async function refusalOf(
  deps: DriveDownloadDeps,
  actor: DriveActor,
  item: DriveItem,
): Promise<ApiError | null> {
  if (inLockedFolder(item)) {
    return new ApiError('forbidden', 'It is in the locked folder, which is never downloaded.');
  }
  const access = await deps.store.host.read('driveItemAccess', { actor, item });
  if (!mayExport(access, item.locked)) {
    return viewOnlyRefusal();
  }
  return null;
}

function uniqueName(taken: Set<string>, wanted: string): string {
  const extension = extname(wanted);
  const stem = wanted.slice(0, wanted.length - extension.length);
  let name = wanted;
  for (let copy = 2; taken.has(name); copy += 1) {
    name = `${stem} (${String(copy)})${extension}`;
  }
  taken.add(name);
  return name;
}

function skippedNote(skipped: readonly DownloadSkipped[], at: Date): ZipEntry[] {
  if (skipped.length === 0) return [];
  const lines = skipped.map((entry) => `${entry.path}\n  ${entry.reason}`);
  return [
    {
      kind: 'text',
      name: SKIPPED_NAME,
      text: `These items could not be added to this download:\n\n${lines.join('\n\n')}\n`,
      mtime: at,
    },
  ];
}

class Gatherer {
  readonly entries: ZipEntry[] = [];
  readonly skipped: DownloadSkipped[] = [];
  files = 0;
  folders = 0;
  bytes = 0;

  constructor(
    private readonly deps: DriveDownloadDeps,
    private readonly actor: DriveActor,
  ) {}

  skip(path: string, reason: string): void {
    this.skipped.push({ path, reason });
  }

  async root(item: DriveItem, root: StoredDrive, name: string): Promise<void> {
    const refusal = await refusalOf(this.deps, this.actor, item);
    if (refusal !== null) {
      this.skip(item.relPath, refusal.message);
    } else if (item.kind === 'folder') {
      await this.folder(item, root, name);
    } else if (isFileItem(item)) {
      await this.file(item, root, name);
    } else {
      this.skip(item.relPath, 'A link or special file; the hub never follows links.');
    }
  }

  private async file(item: DriveItem, root: StoredDrive, name: string): Promise<void> {
    try {
      const { absolute } = await resolveInRoot(root.path, item.relPath);
      const stats = await stat(absolute);
      await access(absolute, constants.R_OK);
      this.entries.push({
        kind: 'file',
        name,
        source: absolute,
        size: stats.size,
        mtime: stats.mtime,
        mode: stats.mode,
        compress: !PACKED.test(item.name) && !PACKED_KINDS.has(item.kind),
      });
      this.files += 1;
      this.bytes += stats.size;
    } catch (cause) {
      log.warn('drive_download.unreadable', {
        itemId: item.id,
        reason: messageOf(cause).slice(0, 300),
      });
      this.skip(item.relPath, 'It is not available on disk or cannot be read.');
    }
  }

  private async folder(item: DriveItem, root: StoredDrive, name: string): Promise<void> {
    this.entries.push({
      kind: 'folder',
      name: `${name}/`,
      mtime: new Date(item.modifiedAt),
      mode: FOLDER_MODE,
    });
    this.folders += 1;
    let after: string | null = null;
    do {
      const window: DriveItemWindow = await this.deps.store.host.call('driveItems', 'children', {
        rootId: item.rootId,
        parentId: item.id,
        after,
        limit: DRIVE_PAGE_SIZE,
        viewer: this.actor.profileId,
      });
      for (const { item: child } of window.entries) {
        await this.root(child, root, `${name}/${child.name}`);
      }
      after = window.next;
    } while (after !== null);
  }
}

export class DriveDownloads {
  private readonly held = new Map<string, Held>();

  constructor(private readonly deps: DriveDownloadDeps) {}

  async prepare(actor: DriveActor, itemIds: readonly string[]): Promise<DriveDownload> {
    this.forgetStale();
    const gathered = new Gatherer(this.deps, actor);
    const found: { readonly item: DriveItem; readonly root: StoredDrive }[] = [];
    for (const id of new Set(itemIds)) {
      const located = await this.locate(actor, id);
      if (located === null) {
        gathered.skip(id, 'It is not available to you.');
      } else {
        found.push(located);
      }
    }
    const [only] = found;
    if (found.length === 1 && only !== undefined && isFileItem(only.item)) {
      return this.single(actor, only.item);
    }
    const taken = new Set<string>();
    for (const { item, root } of found) {
      await gathered.root(item, root, uniqueName(taken, item.name));
    }
    if (gathered.entries.length === 0) {
      throw new ApiError(
        'forbidden',
        gathered.skipped[0]?.reason ?? 'There is nothing in that to download.',
      );
    }
    const entries = [...gathered.entries, ...skippedNote(gathered.skipped, this.deps.now())];
    const name = await this.zipNameOf(
      actor,
      found.map(({ item }) => item),
    );
    const id = this.deps.newId();
    const link = this.deps.links.driveDownloadTicket(id);
    this.held.set(id, { name, entries, expiresAt: Date.parse(link.expiresAt) });
    return DRIVE_DOWNLOAD.parse({
      kind: 'zip',
      name,
      size: null,
      files: gathered.files,
      folders: gathered.folders,
      bytes: gathered.bytes,
      skipped: gathered.skipped,
      url: link.url,
      expiresAt: link.expiresAt,
    });
  }

  take(ticketId: string): DriveZipTicket {
    const ticket = this.held.get(ticketId);
    this.held.delete(ticketId);
    if (ticket === undefined || ticket.expiresAt <= this.deps.now().getTime()) {
      throw new ApiError('not_found', 'This download link is no longer valid; ask for it again.');
    }
    return ticket;
  }

  private async locate(
    actor: DriveActor,
    id: string,
  ): Promise<{ readonly item: DriveItem; readonly root: StoredDrive } | null> {
    try {
      return await this.deps.read.readItemAndRoot(actor, id);
    } catch (cause) {
      if (cause instanceof ApiError && cause.code === 'not_found') return null;
      throw cause;
    }
  }

  private async single(actor: DriveActor, item: DriveItem): Promise<DriveDownload> {
    const refusal = await refusalOf(this.deps, actor, item);
    if (refusal !== null) throw refusal;
    if (!isFileItem(item)) {
      throw new ApiError('invalid_request', 'A link or special file has no bytes to download.');
    }
    const link = this.deps.links.driveDownload(item.id, item.rev);
    await this.deps.store.host.call(
      'driveOpens',
      'record',
      actor.profileId,
      item.id,
      this.deps.now().toISOString(),
    );
    return DRIVE_DOWNLOAD.parse({
      kind: 'file',
      name: item.name,
      size: item.bytes,
      files: 1,
      folders: 0,
      bytes: item.bytes,
      skipped: [],
      url: link.url,
      expiresAt: link.expiresAt,
    });
  }

  private async zipNameOf(actor: DriveActor, roots: readonly DriveItem[]): Promise<string> {
    const [first] = roots;
    if (roots.length === 1 && first !== undefined) return `${first.name}.zip`;
    const parents = new Set(roots.map((item) => item.parentId));
    const [parentId] = parents;
    if (parents.size === 1 && parentId !== undefined && parentId !== null) {
      const parent = await this.deps.store.host.call(
        'driveItems',
        'find',
        parentId,
        actor.profileId,
      );
      if (parent !== undefined && basename(parent.name) !== '') return `${parent.name}.zip`;
    }
    return 'Files.zip';
  }

  private forgetStale(): void {
    const now = this.deps.now().getTime();
    for (const [id, ticket] of this.held) {
      if (ticket.expiresAt <= now) this.held.delete(id);
    }
  }
}
