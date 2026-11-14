import {
  DRIVE_ALBUM,
  type DriveAlbum,
  type DriveAlbumSurface,
  type SmartRule,
} from '@smarteverything/domain';
import type { DriveAlbumsRepository } from '../store/repositories/drive-albums';
import type { DriveGrantsRepository } from '../store/repositories/drive-grants';
import type { DriveItemsRepository } from '../store/repositories/drive-items';
import type { DriveRootsRepository } from '../store/repositories/drive-roots';
import type { SqlParameters } from '../store/sql';
import { albumVisibleTo, canRead, itemAccess, type DriveActor } from './access';
import { compileSmartRule, SMART_ORDER_KEY } from './smart-sql-compile';

export interface SmartStatement {
  readonly text: string;
  readonly parameters: SqlParameters;
}

export interface SmartMemberRow {
  readonly id: string;
  readonly at: number;
}

export interface SmartQueryRunner {
  rows(statement: SmartStatement): readonly SmartMemberRow[];
  count(statement: SmartStatement): number;
}

export type AlbumCursor =
  | { readonly kind: 'manual'; readonly position: number; readonly itemId: string }
  | { readonly kind: 'smart'; readonly at: number; readonly itemId: string };

export interface AlbumPage {
  readonly itemIds: readonly string[];
  readonly next: AlbumCursor | null;
}

export type NewAlbum = {
  readonly title: string;
  readonly surface: DriveAlbumSurface;
  readonly scope: DriveAlbum['scope'];
} & ({ readonly kind: 'manual' } | { readonly kind: 'smart'; readonly rule: SmartRule });

export type AlbumItemRefusal = 'missing' | 'folder' | 'out-of-reach';

export class DriveAlbumAccessError extends Error {
  override readonly name = 'DriveAlbumAccessError';

  constructor(readonly albumId: string) {
    super(`The drive album ${albumId} is not part of this person's access.`);
  }
}

export class DriveAlbumItemError extends Error {
  override readonly name = 'DriveAlbumItemError';

  constructor(
    readonly itemId: string,
    readonly reason: AlbumItemRefusal,
  ) {
    super(`The item ${itemId} cannot join this album: ${reason}.`);
  }
}

export class DriveAlbumCursorError extends Error {
  override readonly name = 'DriveAlbumCursorError';

  constructor(readonly albumId: string) {
    super(`The page cursor does not belong to the kind of the drive album ${albumId}.`);
  }
}

export interface DriveAlbumsDeps {
  readonly albums: DriveAlbumsRepository;
  readonly items: DriveItemsRepository;
  readonly roots: DriveRootsRepository;
  readonly grants: DriveGrantsRepository;
  readonly runner: SmartQueryRunner;
  readonly newId: () => string;
  readonly now: () => string;
  readonly timeZone: string;
}

function smartStatements(
  rule: SmartRule,
  album: DriveAlbum,
  viewer: DriveActor | null,
  timeZone: string,
): { readonly where: string; readonly parameters: SqlParameters } {
  const filter = compileSmartRule(rule, {
    reachProfileId: album.scope === 'home' ? null : album.ownerProfileId,
    starViewerId: viewer?.profileId ?? album.ownerProfileId,
    timeZone,
  });
  return { where: filter.text, parameters: filter.parameters };
}

function hasStarRule(rule: SmartRule): boolean {
  return rule.rules.some((leaf) => leaf.kind === 'starred');
}

export class DriveAlbumsService {
  constructor(private readonly deps: DriveAlbumsDeps) {}

  list(viewer: DriveActor, surface: DriveAlbumSurface): DriveAlbum[] {
    return this.deps.albums
      .listVisibleTo(viewer.profileId, surface)
      .map((album) => this.viewedBy(album, viewer));
  }

  get(id: string, viewer: DriveActor): DriveAlbum {
    const album = this.deps.albums.byId(id);
    if (!albumVisibleTo(viewer, album)) {
      throw new DriveAlbumAccessError(id);
    }
    return this.viewedBy(album, viewer);
  }

  create(input: NewAlbum, viewer: DriveActor): DriveAlbum {
    const now = this.deps.now();
    const base = {
      id: this.deps.newId(),
      title: input.title,
      surface: input.surface,
      scope: input.scope,
      ownerProfileId: input.scope === 'person' ? viewer.profileId : null,
      coverItemId: null,
    };
    const draft =
      input.kind === 'smart'
        ? { ...base, kind: input.kind, rule: input.rule }
        : { ...base, kind: input.kind };
    DRIVE_ALBUM.parse({ ...draft, itemCount: 0, createdAt: now, updatedAt: now });
    const created = this.deps.albums.insert(draft);
    return created.kind === 'smart' ? this.viewedBy(this.refresh(created.id), viewer) : created;
  }

  rename(id: string, title: string, viewer: DriveActor): DriveAlbum {
    this.get(id, viewer);
    return this.deps.albums.update(id, { title });
  }

  setRule(id: string, rule: SmartRule, viewer: DriveActor): DriveAlbum {
    this.get(id, viewer);
    this.deps.albums.update(id, { rule });
    return this.viewedBy(this.refresh(id), viewer);
  }

  setCover(id: string, itemId: string | null, viewer: DriveActor): DriveAlbum {
    const album = this.get(id, viewer);
    if (itemId !== null) {
      this.assertJoinable(album, itemId, viewer);
    }
    return this.deps.albums.update(id, { coverItemId: itemId });
  }

  remove(id: string, viewer: DriveActor): void {
    this.get(id, viewer);
    this.deps.albums.remove(id);
  }

  addItems(id: string, itemIds: readonly string[], viewer: DriveActor): DriveAlbum {
    const album = this.get(id, viewer);
    for (const itemId of itemIds) {
      this.assertJoinable(album, itemId, viewer);
    }
    return this.deps.albums.addItems(id, itemIds);
  }

  removeItems(id: string, itemIds: readonly string[], viewer: DriveActor): DriveAlbum {
    this.get(id, viewer);
    return this.deps.albums.removeItems(id, itemIds);
  }

  moveItem(
    id: string,
    itemId: string,
    between: { readonly before: string | null; readonly after: string | null },
    viewer: DriveActor,
  ): DriveAlbum {
    this.get(id, viewer);
    return this.deps.albums.moveItem(id, itemId, between);
  }

  members(id: string, viewer: DriveActor, cursor: AlbumCursor | null, limit: number): AlbumPage {
    const album = this.get(id, viewer);
    return album.kind === 'smart'
      ? this.smartMembers(album, album.rule, viewer, { cursor, limit })
      : this.manualMembers(album, cursor, limit);
  }

  refresh(id: string): DriveAlbum {
    const album = this.deps.albums.byId(id);
    if (album.kind !== 'smart') {
      return album;
    }
    const total = this.count(album, album.rule);
    return total === album.itemCount ? album : this.deps.albums.setItemCount(id, total);
  }

  refreshAll(): void {
    for (const album of this.deps.albums.listAll()) {
      this.refresh(album.id);
    }
  }

  private viewedBy(album: DriveAlbum, viewer: DriveActor): DriveAlbum {
    if (album.kind !== 'smart' || album.scope !== 'home' || !hasStarRule(album.rule)) {
      return album;
    }
    return { ...album, itemCount: this.count(album, album.rule, viewer) };
  }

  private count(album: DriveAlbum, rule: SmartRule, viewer: DriveActor | null = null): number {
    const { where, parameters } = smartStatements(rule, album, viewer, this.deps.timeZone);
    return this.deps.runner.count({
      text: `select count(*) as total from drive_items where ${where}`,
      parameters,
    });
  }

  private manualMembers(album: DriveAlbum, cursor: AlbumCursor | null, limit: number): AlbumPage {
    if (cursor !== null && cursor.kind !== 'manual') {
      throw new DriveAlbumCursorError(album.id);
    }
    const window = this.deps.albums.members(album.id, cursor, limit);
    return {
      itemIds: window.members.map((member) => member.itemId),
      next: window.next === null ? null : { kind: 'manual', ...window.next },
    };
  }

  private smartMembers(
    album: DriveAlbum,
    rule: SmartRule,
    viewer: DriveActor,
    page: { readonly cursor: AlbumCursor | null; readonly limit: number },
  ): AlbumPage {
    const { cursor, limit } = page;
    if (cursor !== null && cursor.kind !== 'smart') {
      throw new DriveAlbumCursorError(album.id);
    }
    const { where, parameters } = smartStatements(rule, album, viewer, this.deps.timeZone);
    const after = cursor === null ? '' : `and (${SMART_ORDER_KEY}, id) < ($afterAt, $afterId)`;
    const rows = this.deps.runner.rows({
      text: `select id, ${SMART_ORDER_KEY} as at from drive_items
        where ${where} ${after}
        order by ${SMART_ORDER_KEY} desc, id desc limit $pageLimit`,
      parameters:
        cursor === null
          ? { ...parameters, pageLimit: limit }
          : { ...parameters, pageLimit: limit, afterAt: cursor.at, afterId: cursor.itemId },
    });
    const last = rows.at(-1);
    return {
      itemIds: rows.map((row) => row.id),
      next:
        rows.length === limit && last !== undefined
          ? { kind: 'smart', at: last.at, itemId: last.id }
          : null,
    };
  }

  private assertJoinable(album: DriveAlbum, itemId: string, viewer: DriveActor): void {
    const item = this.deps.items.find(itemId, viewer.profileId);
    if (item === undefined) {
      throw new DriveAlbumItemError(itemId, 'missing');
    }
    if (item.kind === 'folder') {
      throw new DriveAlbumItemError(itemId, 'folder');
    }
    const root = this.deps.roots.byId(item.rootId);
    const reachable =
      root.scope === 'home' ||
      (album.scope === 'person' &&
        canRead(
          itemAccess(
            { driveGrants: this.deps.grants, driveItems: this.deps.items },
            viewer,
            root,
            item,
          ),
        ));
    if (!reachable) {
      throw new DriveAlbumItemError(itemId, 'out-of-reach');
    }
  }
}
