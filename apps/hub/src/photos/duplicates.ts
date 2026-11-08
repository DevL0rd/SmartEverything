import {
  ApiError,
  DUPLICATE_STATS,
  type DriveItem,
  type DuplicateStats,
  type DuplicateGroup,
  type DuplicateKeepBest,
} from '@smarteverything/domain';
import { z } from 'zod';
import { DRIVE_PAGE_SIZE, albumVisibleTo, type DriveActor } from '../drive/service-read';
import { storedRow } from '../store/codec';
import type { StoreContext } from '../store/context';
import { DriveAlbumsRepository } from '../store/repositories/drive-albums';
import { DriveItemsRepository } from '../store/repositories/drive-items';
import { SettingsKvRepository } from '../store/repositories/settings-kv';
import { inList, jsonText, type SqlParameters } from '../store/sql';
import { photoMembership } from './membership';

export interface DuplicateChanges {
  readonly trash: (itemIds: readonly string[], actor: DriveActor) => Promise<void>;
  readonly star: (itemId: string, actor: DriveActor) => Promise<void>;
}

export interface DuplicateScope {
  readonly media: boolean;
  readonly rootId?: string | undefined;
}

export interface DuplicatePage {
  readonly groups: readonly DuplicateGroup[];
  readonly next: string | null;
}

export interface KeepBestResult {
  readonly groups: number;
  readonly trashed: number;
  readonly reclaimedBytes: number;
}

const HIDDEN_KEY = 'photos-not-duplicates';

const HIDDEN = z.record(z.string(), z.array(z.string()));

const CURSOR = /^(\d+):([0-9a-f]{64})$/;

const GROUP_ROW = z.strictObject({ sha256: z.string(), bytes: z.number(), copies: z.number() });

const MEMBER_ROW = storedRow(
  z.strictObject({
    id: z.string(),
    sha256: z.string(),
    bytes: z.number(),
    modified_at: z.string(),
    starred: z.boolean(),
    pixels: z.number(),
    read_only: z.boolean(),
  }),
  { flags: ['starred', 'read_only'] },
);

const STATS_ROW = z.strictObject({
  groups: z.number(),
  extra: z.number(),
  back: z.number(),
});

const SOURCE_ROW = z.strictObject({
  root_id: z.string(),
  label: z.string(),
  copies: z.number(),
  bytes: z.number(),
});

const CANDIDATES = `candidate as (
  select i.id, i.root_id, r.label, r.read_only, i.sha256, i.bytes, i.modified_at, i.starred,
         coalesce(i.width, 0) * coalesce(i.height, 0) as pixels
  from drive_items i join drive_roots r on r.id = i.root_id
  where i.sha256 is not null and i.kind <> 'folder'
    and ($owner = 1 or r.scope = 'home' or r.owner_profile_id = $profile)
    and (i.kind in ('image', 'video') and ${photoMembership('i.id')} or $media = 0)
    and ($media = 1 or $root is null or i.root_id = $root)
    and i.sha256 not in (select value from json_each($hidden))
)`;

const GROUPS = `${CANDIDATES},
  dup as (select sha256, max(bytes) as bytes, count(*) as copies from candidate
          group by sha256 having count(*) > 1)`;

interface Member {
  readonly id: string;
  readonly bytes: number;
  readonly modifiedAt: string;
  readonly starred: boolean;
  readonly pixels: number;
  readonly readOnly: boolean;
}

const compareText = (left: string, right: string): number =>
  left === right ? 0 : left < right ? -1 : 1;

export function bestFirst(left: Member, right: Member): number {
  return (
    right.pixels - left.pixels ||
    right.bytes - left.bytes ||
    compareText(right.modifiedAt, left.modifiedAt) ||
    compareText(left.id, right.id)
  );
}

function memberOf(row: z.output<typeof MEMBER_ROW>): Member {
  return {
    id: row.id,
    bytes: row.bytes,
    modifiedAt: row.modified_at,
    starred: row.starred,
    pixels: row.pixels,
    readOnly: row.read_only,
  };
}

function nextCursor(rows: readonly z.output<typeof GROUP_ROW>[]): string | null {
  const last = rows.at(-1);
  return rows.length === DRIVE_PAGE_SIZE && last !== undefined
    ? `${String(last.bytes)}:${last.sha256}`
    : null;
}

function invalidCursor(): ApiError {
  return new ApiError('invalid_request', 'The cursor is not one this list gave out.');
}

export class DuplicatesService {
  private readonly items: DriveItemsRepository;
  private readonly albums: DriveAlbumsRepository;
  private readonly settings: SettingsKvRepository;

  constructor(
    private readonly context: StoreContext,
    private readonly changes: DuplicateChanges,
  ) {
    this.items = new DriveItemsRepository(context);
    this.albums = new DriveAlbumsRepository(context);
    this.settings = new SettingsKvRepository(context);
  }

  groups(actor: DriveActor, scope: DuplicateScope, cursor: string | undefined): DuplicatePage {
    const rows = this.groupRows(actor, scope, cursor);
    const members = this.members(
      actor,
      scope,
      rows.map((row) => row.sha256),
    );
    return {
      groups: rows.map((row) => this.groupOf(row.sha256, row.bytes, members.get(row.sha256) ?? [])),
      next: nextCursor(rows),
    };
  }

  stats(actor: DriveActor, scope: DuplicateScope): DuplicateStats {
    const parameters = this.parameters(actor, scope);
    const totals = this.context.sql.get(
      STATS_ROW,
      `with ${GROUPS}
       select count(*) as groups, coalesce(sum(copies - 1), 0) as extra,
              coalesce(sum((copies - 1) * bytes), 0) as back from dup`,
      parameters,
    );
    const sources = this.context.sql.all(
      SOURCE_ROW,
      `with ${GROUPS}
       select c.root_id, c.label, count(*) as copies, sum(c.bytes) as bytes
       from candidate c join dup d on d.sha256 = c.sha256
       group by c.root_id, c.label order by bytes desc, c.root_id`,
      parameters,
    );
    return DUPLICATE_STATS.parse({
      groups: totals?.groups ?? 0,
      extraCopies: totals?.extra ?? 0,
      bytesBack: totals?.back ?? 0,
      sources: sources.map((row) => ({
        rootId: row.root_id,
        label: row.label,
        copies: row.copies,
        bytes: row.bytes,
      })),
    });
  }

  async keepBest(actor: DriveActor, request: DuplicateKeepBest): Promise<KeepBestResult> {
    const scope = { media: true } as const;
    const hashes = request.scope === 'groups' ? request.sha256s : this.everyHash(actor, scope);
    const members = this.members(actor, scope, hashes);
    let groups = 0;
    let trashed = 0;
    let reclaimedBytes = 0;
    for (const hash of hashes) {
      const ranked = [...(members.get(hash) ?? [])].sort(bestFirst);
      const [keeper, ...others] = ranked;
      const losers = others.filter((member) => !member.readOnly);
      if (keeper !== undefined && losers.length > 0) {
        await this.collapse(actor, keeper, losers);
        groups += 1;
        trashed += losers.length;
        reclaimedBytes += losers.reduce((sum, loser) => sum + loser.bytes, 0);
      }
    }
    return { groups, trashed, reclaimedBytes };
  }

  markNotDuplicates(actor: DriveActor, sha256s: readonly string[]): void {
    const hidden = new Set(this.hidden(actor.profileId));
    for (const hash of sha256s) hidden.add(hash);
    this.settings.save(HIDDEN_KEY, {
      ...this.allHidden(),
      [actor.profileId]: [...hidden].sort(),
    });
  }

  private async collapse(
    actor: DriveActor,
    keeper: Member,
    losers: readonly Member[],
  ): Promise<void> {
    this.mergeAlbums(actor, keeper, losers);
    if (!keeper.starred && losers.some((loser) => loser.starred)) {
      await this.changes.star(keeper.id, actor);
    }
    await this.changes.trash(
      losers.map((loser) => loser.id),
      actor,
    );
  }

  private mergeAlbums(actor: DriveActor, keeper: Member, losers: readonly Member[]): void {
    const present = new Set(this.albums.albumsOf(keeper.id));
    const wanted = new Set(losers.flatMap((loser) => this.albums.albumsOf(loser.id)));
    for (const albumId of wanted) {
      const album = this.albums.find(albumId);
      if (!present.has(albumId) && album !== undefined && albumVisibleTo(actor, album)) {
        this.albums.addItems(albumId, [keeper.id]);
      }
    }
  }

  private groupRows(
    actor: DriveActor,
    scope: DuplicateScope,
    cursor: string | undefined,
  ): z.output<typeof GROUP_ROW>[] {
    const after = this.after(cursor);
    return this.context.sql.all(
      GROUP_ROW,
      `with ${GROUPS}
       select sha256, bytes, copies from dup
       where ($afterBytes is null or bytes < $afterBytes or (bytes = $afterBytes and sha256 > $afterSha))
       order by bytes desc, sha256 limit $limit`,
      {
        ...this.parameters(actor, scope),
        afterBytes: after?.bytes ?? null,
        afterSha: after?.sha256 ?? null,
        limit: DRIVE_PAGE_SIZE,
      },
    );
  }

  private everyHash(actor: DriveActor, scope: DuplicateScope): string[] {
    const hashes: string[] = [];
    let cursor: string | undefined;
    do {
      const rows = this.groupRows(actor, scope, cursor);
      hashes.push(...rows.map((row) => row.sha256));
      cursor = nextCursor(rows) ?? undefined;
    } while (cursor !== undefined);
    return hashes;
  }

  private groupOf(sha256: string, bytes: number, members: readonly Member[]): DuplicateGroup {
    const ranked = [...members].sort(bestFirst);
    const [keeper] = ranked;
    if (keeper === undefined) {
      throw new ApiError('internal', 'A duplicate group lost its copies while it was read.');
    }
    return {
      sha256,
      bytes,
      keeperItemId: keeper.id,
      reclaimableBytes: bytes * (ranked.length - 1),
      items: ranked.map((member) => this.item(member.id)),
    };
  }

  private item(id: string): DriveItem {
    return this.items.byId(id);
  }

  private members(
    actor: DriveActor,
    scope: DuplicateScope,
    hashes: readonly string[],
  ): Map<string, Member[]> {
    const filter = inList('sha256', 'hashes', hashes);
    const rows = this.context.sql.all(
      MEMBER_ROW,
      `with ${CANDIDATES}
       select id, sha256, bytes, modified_at, starred, pixels, read_only from candidate
       where ${filter.text}`,
      { ...this.parameters(actor, scope), ...filter.parameters },
    );
    const byHash = new Map<string, Member[]>();
    for (const row of rows) {
      const list = byHash.get(row.sha256) ?? [];
      list.push(memberOf(row));
      byHash.set(row.sha256, list);
    }
    return byHash;
  }

  private parameters(actor: DriveActor, scope: DuplicateScope): SqlParameters {
    return {
      owner: actor.owner ? 1 : 0,
      profile: actor.profileId,
      media: scope.media ? 1 : 0,
      root: scope.rootId ?? null,
      hidden: jsonText(this.hidden(actor.profileId)),
    };
  }

  private hidden(profileId: string): readonly string[] {
    return this.allHidden()[profileId] ?? [];
  }

  private allHidden(): Readonly<Record<string, readonly string[]>> {
    const saved = this.settings.read(HIDDEN_KEY);
    return saved === null ? {} : HIDDEN.parse(saved);
  }

  private after(cursor: string | undefined): { bytes: number; sha256: string } | undefined {
    if (cursor === undefined) return undefined;
    const match = CURSOR.exec(cursor);
    if (match === null) throw invalidCursor();
    return { bytes: Number(match[1]), sha256: match[2] ?? '' };
  }
}
