import { DRIVE_ITEM, type DriveItem } from '@smarteverything/domain';
import { z } from 'zod';
import { lockedSql } from '../../drive/access';
import { invalidateDerivedRevision, newContent } from './drive-media-revision';
import { found, type StoreContext } from '../context';
import { itemColumns, sameStored } from './drive-item-columns';
import { momentOfNs } from './drive-inodes';
import { DriveInodeError, DriveItemInodes, type DriveInodePatch } from './drive-item-inodes';
import { DriveItemLookups } from './drive-item-lookups';
import { driveRootTotals, type DriveRootTotals } from './drive-roots';
import { SELECT, STORED_ITEM } from './drive-item-rows';
import { FOLDER_CHAIN } from './drive-item-sql';
import {
  nextMarkOf,
  sortOrderOf,
  type DriveSortedChildrenQuery,
  type DriveSortedWindow,
} from './drive-item-sort';

const SUBTREE_ROW = z.strictObject({ id: z.string(), depth: z.int().nonnegative() });

const CHAIN_ROW = z.strictObject({ id: z.string() });

const SUBTREE = `with recursive subtree(id, depth) as (
  select id, 0 from drive_items where id = $id
  union all
  select child.id, subtree.depth + 1 from drive_items child join subtree on child.parent_id = subtree.id
) select id, depth from subtree`;

export interface DriveItemIdentity {
  readonly dev: string;
  readonly ino: string;
}

type Derived =
  | 'rev'
  | 'etag'
  | 'openedAt'
  | 'locked'
  | 'lockedHere'
  | 'openComments'
  | 'colour'
  | 'totalBytes'
  | 'totalFiles';

type Draft<T> = T extends unknown ? Omit<T, Derived | 'iconHint'> : never;

export type DriveItemDraft = Draft<DriveItem>;

export interface DriveItemWrite {
  readonly item: DriveItemDraft;
  readonly identity: DriveItemIdentity;
  readonly inode?: DriveInodePatch;
  readonly shareInode?: number;
}

export interface DriveItemWriteResult {
  readonly item: DriveItem;
  readonly changed: boolean;
}

export interface DriveItemEntry {
  readonly item: DriveItem;
  readonly identity: DriveItemIdentity | null;
  readonly inodeId: number;
}

export interface DriveChildrenQuery {
  readonly rootId: string;
  readonly parentId: string | null;
  readonly after: string | null;
  readonly limit: number;
  readonly viewer: string | null;
}

export interface DriveItemWindow {
  readonly entries: readonly DriveItemEntry[];
  readonly next: string | null;
}

const LOCKED = z.object({ locked: z.int() });

export function driveEtag(rev: number, item: DriveItemDraft): string {
  const content =
    'sha256' in item && item.sha256 !== null
      ? item.sha256
      : `${String(item.bytes)}.${String(Date.parse(item.modifiedAt))}`;
  return `${String(rev)}-${content}`;
}

export class DriveItemsRepository {
  private readonly inodes: DriveItemInodes;
  readonly lookups: DriveItemLookups;
  private readonly totals: DriveRootTotals;

  constructor(private readonly context: StoreContext) {
    this.inodes = new DriveItemInodes(context);
    this.lookups = new DriveItemLookups(context);
    this.totals = driveRootTotals(context);
  }

  find(id: string, viewer: string | null): DriveItem | undefined {
    return this.stored(id, viewer)?.item;
  }

  byId(id: string, viewer: string | null): DriveItem {
    return found(this.find(id, viewer), 'drive item', id);
  }

  identityOf(id: string): DriveItemIdentity | null {
    return found(this.stored(id, null), 'drive item', id).identity;
  }

  byPath(rootId: string, relPath: string, viewer: string | null): DriveItem | undefined {
    return this.context.sql.get(
      STORED_ITEM,
      `${SELECT} where root_id = $rootId and rel_path = $relPath`,
      { rootId, relPath, viewer, now: this.context.now() },
    )?.item;
  }

  children(query: DriveChildrenQuery): DriveItemWindow {
    const { rootId, parentId, after, limit, viewer } = query;
    const now = this.context.now();
    const rows = this.context.sql.all(
      STORED_ITEM,
      `${SELECT}
        where root_id = $rootId and parent_id is $parentId
          ${after === null ? '' : 'and name > $after'}
        order by name limit $limit`,
      after === null
        ? { rootId, parentId, limit, viewer, now }
        : { rootId, parentId, after, limit, viewer, now },
    );
    const last = rows.at(-1);
    return {
      entries: rows,
      next: rows.length === limit && last !== undefined ? last.item.name : null,
    };
  }

  sortedChildren(query: DriveSortedChildrenQuery): DriveSortedWindow {
    const { rootId, parentId, limit, viewer } = query;
    const order = sortOrderOf(query.sort, query.after);
    const entries = this.context.sql.all(
      STORED_ITEM,
      `${SELECT} where root_id = $rootId and parent_id is $parentId ${order.where} ${order.orderBy} limit $limit`,
      { rootId, parentId, limit, viewer, now: this.context.now(), ...order.parameters },
    );
    return { entries, next: nextMarkOf(this.context, query, entries) };
  }

  write(request: DriveItemWrite): DriveItemWriteResult {
    return this.context.write(() => {
      const input = this.aligned(request);
      if (!this.lookups.exists(input.item.id)) {
        const created = this.candidate(input, 1);
        this.totals.changing(created.rootId);
        this.save(true, created, input.identity, this.inodeFor(input, created));
        return {
          item:
            input.shareInode === undefined ? this.inserted(created) : this.byId(created.id, null),
          changed: true,
        };
      }
      return this.update(input, found(this.stored(input.item.id, null), 'item', input.item.id));
    });
  }

  folderChainOf(id: string): readonly string[] {
    return this.context.sql.all(CHAIN_ROW, FOLDER_CHAIN, { id }).map((row) => row.id);
  }

  remove(id: string): void {
    this.context.write(() => {
      this.totals.changing(this.byId(id, null).rootId);
      const levels = new Map<number, string[]>();
      for (const row of this.context.sql.all(SUBTREE_ROW, SUBTREE, { id })) {
        const level = levels.get(row.depth);
        if (level === undefined) levels.set(row.depth, [row.id]);
        else level.push(row.id);
      }
      const deepestFirst = [...levels.entries()].sort(([a], [b]) => b - a);
      for (const [, ids] of deepestFirst) {
        this.context.sql.run(
          'remove the drive items of one folder level',
          'delete from drive_items where id in (select value from json_each($ids))',
          { ids: JSON.stringify(ids) },
        );
      }
    });
  }

  private stored(id: string, viewer: string | null): DriveItemEntry | undefined {
    return this.context.sql.get(STORED_ITEM, `${SELECT} where id = $id`, {
      id,
      viewer,
      now: this.context.now(),
    });
  }

  private update(written: DriveItemWrite, existing: DriveItemEntry): DriveItemWriteResult {
    const input = this.unread(written, existing.item);
    if (input.shareInode !== undefined && input.shareInode !== existing.inodeId) {
      throw new DriveInodeError(
        `The drive item ${input.item.id} already has inode ${String(existing.inodeId)}, so it cannot share inode ${String(input.shareInode)}.`,
      );
    }
    const patch = input.inode ?? {};
    const same = this.candidate(input, existing.item.rev);
    const changes = this.inodes.changes(this.inodes.byId(existing.inodeId), patch, same);
    if (changes === null && this.unchanged(existing, same, input.identity)) {
      return { item: existing.item, changed: false };
    }
    const bumped = this.candidate(input, existing.item.rev + 1);
    this.totalsChanging(existing.item, bumped);
    this.save(false, bumped, input.identity, existing.inodeId);
    if (changes !== null) this.inodes.apply(existing.inodeId, patch, changes);
    if (bumped.kind === 'image' || bumped.kind === 'video') {
      invalidateDerivedRevision(this.context, bumped.id);
    }
    return { item: this.byId(bumped.id, null), changed: true };
  }

  private totalsChanging(existing: DriveItem, next: DriveItem): void {
    if (
      existing.rootId === next.rootId &&
      existing.kind === next.kind &&
      existing.bytes === next.bytes
    ) {
      return;
    }
    this.totals.changing(existing.rootId);
    this.totals.changing(next.rootId);
  }

  private unread(input: DriveItemWrite, existing: DriveItem): DriveItemWrite {
    const item = input.item;
    const media = item.kind === 'image' || item.kind === 'video' || item.kind === 'audio';
    if (!media || !newContent(existing, item)) return input;
    return { ...input, item: { ...item, takenAt: null } };
  }

  private inserted(item: DriveItem): DriveItem {
    const row = found(
      this.context.sql.get(
        LOCKED,
        `select ${lockedSql('i')} as locked from drive_items i where i.id = $id`,
        { id: item.id },
      ),
      'drive item',
      item.id,
    );
    return { ...item, starred: false, shared: false, locked: row.locked === 1 };
  }

  private inodeFor(input: DriveItemWrite, item: DriveItem): number {
    return input.shareInode === undefined
      ? this.inodes.create(item, input.inode ?? {})
      : this.inodes.share(item, input.shareInode);
  }

  private aligned(input: DriveItemWrite): DriveItemWrite {
    const mtimeNs = input.inode?.mtimeNs;
    return mtimeNs === undefined
      ? input
      : { ...input, item: { ...input.item, modifiedAt: momentOfNs(mtimeNs) } };
  }

  private candidate(input: DriveItemWrite, rev: number): DriveItem {
    return DRIVE_ITEM.parse({
      ...input.item,
      openedAt: null,
      locked: false,
      lockedHere: false,
      openComments: 0,
      ...(input.item.kind === 'folder'
        ? { colour: null, iconHint: false, totalBytes: 0, totalFiles: 0 }
        : {}),
      rev,
      etag: driveEtag(rev, input.item),
    });
  }

  private unchanged(
    existing: DriveItemEntry,
    candidate: DriveItem,
    identity: DriveItemIdentity,
  ): boolean {
    return (
      existing.identity !== null &&
      sameStored(itemColumns(existing.item, existing.identity), itemColumns(candidate, identity))
    );
  }

  private save(
    created: boolean,
    item: DriveItem,
    identity: DriveItemIdentity,
    inodeId: number,
  ): void {
    const columns = { ...itemColumns(item, identity), inode_id: inodeId };
    const names = Object.keys(columns);
    if (created) {
      this.context.sql.run(
        'create the drive item',
        `insert into drive_items (${names.join(', ')}) values (${names
          .map((name) => `$${name}`)
          .join(', ')})`,
        columns,
      );
      return;
    }
    this.context.sql.run(
      'update the drive item',
      `update drive_items set ${names
        .filter((name) => name !== 'id')
        .map((name) => `${name} = $${name}`)
        .join(', ')} where id = $id`,
      columns,
    );
  }
}
