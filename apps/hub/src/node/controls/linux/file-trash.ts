import { FILE_PAGE_SIZE, type FileTrashEntry, type FileTrashList } from '@smarteverything/domain';
import type { Stats } from 'node:fs';
import { lstat, readdir, readFile, stat } from 'node:fs/promises';
import { join, posix } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import { mountPointsOf } from './file-places';
import { orElse, UNREADABLE } from './fs-fallback';
import { readTrashInfo, TRASH_INFO_SUFFIX, XdgTrash } from './trash';

interface Bin {
  readonly trash: XdgTrash;
  readonly drive: boolean;
}

interface Found {
  readonly id: string;
  readonly bin: Bin;
  readonly name: string;
}

export interface TrashBinsOptions {
  readonly mounts: string;
  readonly uid: number;
  readonly now?: () => Date;
}

function kindOf(stats: Stats): FileTrashEntry['kind'] {
  if (stats.isDirectory()) {
    return 'folder';
  }
  if (stats.isSymbolicLink()) {
    return 'link';
  }
  return stats.isFile() ? 'file' : 'other';
}

async function treeBytes(path: string): Promise<number> {
  const stats = await orElse(lstat(path), null, UNREADABLE);
  if (stats === null) {
    return 0;
  }
  if (!stats.isDirectory()) {
    return stats.size;
  }
  const names = await orElse(readdir(path), [], UNREADABLE);
  const sizes = await Promise.all(names.map((name) => treeBytes(join(path, name))));
  return sizes.reduce((sum, size) => sum + size, 0);
}

export class TrashBins {
  constructor(
    readonly home: XdgTrash,
    private readonly options: TrashBinsOptions,
  ) {}

  async list(cursor: number): Promise<FileTrashList> {
    const found = await this.everything();
    const page = found.slice(cursor, cursor + FILE_PAGE_SIZE);
    const entries = await Promise.all(page.map((item) => this.describe(item)));
    const end = cursor + FILE_PAGE_SIZE;
    return {
      entries: entries.filter((entry) => entry !== null),
      total: found.length,
      next: end < found.length ? end : null,
    };
  }

  async restore(id: string): Promise<string> {
    const { bin, name } = await this.locate(id);
    return bin.trash.restore(name);
  }

  async purge(id: string): Promise<string> {
    const { bin, name } = await this.locate(id);
    return bin.trash.forget(name);
  }

  async contains(path: string): Promise<boolean> {
    const bins = await this.bins();
    return bins.some(
      ({ trash }) => path === trash.root || path.startsWith(`${trash.root}${posix.sep}`),
    );
  }

  private async bins(): Promise<readonly Bin[]> {
    const mounts = await orElse(readFile(this.options.mounts, 'utf8'), '');
    const now = this.options.now;
    const named = `.Trash-${String(this.options.uid)}`;
    const candidates = mountPointsOf(mounts).flatMap((mount): Bin[] => [
      { trash: new XdgTrash(mount, now, named, mount), drive: true },
      {
        trash: new XdgTrash(join(mount, '.Trash'), now, String(this.options.uid), mount),
        drive: true,
      },
    ]);
    const present = await Promise.all(
      candidates.map(async (bin) => {
        const info = await orElse(stat(join(bin.trash.root, 'info')), null, UNREADABLE);
        return info?.isDirectory() === true ? bin : null;
      }),
    );
    return [{ trash: this.home, drive: false }, ...present.filter((bin) => bin !== null)];
  }

  private async locate(id: string): Promise<Found> {
    const bins = await this.bins();
    const split = id.lastIndexOf('/');
    if (split === -1) {
      return { id, bin: { trash: this.home, drive: false }, name: id };
    }
    const root = id.slice(0, split);
    const bin = bins.find((candidate) => candidate.drive && candidate.trash.root === root);
    if (bin === undefined) {
      throw new NodeFailureError('not_found', 'That item is not in the Trash.');
    }
    return { id, bin, name: id.slice(split + 1) };
  }

  private async everything(): Promise<readonly Found[]> {
    const bins = await this.bins();
    const found = await Promise.all(
      bins.map(async (bin) => {
        const names = await orElse(readdir(join(bin.trash.root, 'info')), [], UNREADABLE);
        return names
          .filter((file) => file.endsWith(TRASH_INFO_SUFFIX))
          .map((file): Found => {
            const name = file.slice(0, -TRASH_INFO_SUFFIX.length);
            return { id: bin.drive ? `${bin.trash.root}/${name}` : name, bin, name };
          });
      }),
    );
    const dated = await Promise.all(
      found.flat().map(async (item) => ({ item, at: await this.deletedAt(item) })),
    );
    return dated
      .sort((a, b) => b.at - a.at || a.item.id.localeCompare(b.item.id))
      .map(({ item }) => item);
  }

  private async deletedAt(item: Found): Promise<number> {
    const info = await this.info(item);
    return info?.deletedAt?.getTime() ?? 0;
  }

  private async info(item: Found): Promise<ReturnType<typeof readTrashInfo>> {
    const text = await orElse(
      readFile(join(item.bin.trash.root, 'info', `${item.name}${TRASH_INFO_SUFFIX}`), 'utf8'),
      null,
      UNREADABLE,
    );
    return text === null ? null : readTrashInfo(text);
  }

  private async describe(item: Found): Promise<FileTrashEntry | null> {
    const info = await this.info(item);
    const stored = join(item.bin.trash.root, 'files', item.name);
    const stats = await orElse(lstat(stored), null, UNREADABLE);
    if (info === null || stats === null) {
      return null;
    }
    const original = item.bin.trash.originalOf(info.path);
    return {
      trashId: item.id,
      name: original.slice(original.lastIndexOf('/') + 1) || item.name,
      originalPath: original,
      deletedAt: (info.deletedAt ?? new Date(stats.mtimeMs)).toISOString(),
      size: stats.isDirectory() ? await treeBytes(stored) : stats.size,
      kind: kindOf(stats),
    };
  }
}
