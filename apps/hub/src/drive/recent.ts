import {
  DRIVE_RECENT_ENTRY,
  type DriveRecentEntry,
  type DriveRecentFilter,
  type DriveRecentPage,
  type DriveRecentQuery,
} from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { z } from 'zod';
import type { StoreContext } from '../store/context';
import { DriveItemsRepository } from '../store/repositories/drive-items';
import { DriveShortcutsRepository } from '../store/repositories/drive-shortcuts';
import { accessFilter, accessSql, driveSql, type DriveActor } from './access';
import { decodeCursor, encodeCursor } from './search';
import { shortcutFrom } from './social/shortcut-from';

export const DRIVE_CHANGED_OPS = ['update', 'rename', 'move', 'restore'] as const;

const RECENT_KINDS = ['opened', 'added', 'changed', 'shortcut'] as const;

type RecentKind = (typeof RECENT_KINDS)[number];

const KINDS: Readonly<Record<DriveRecentFilter, readonly RecentKind[]>> = {
  everything: ['opened', 'added', 'changed', 'shortcut'],
  opened: ['opened'],
  added: ['added', 'shortcut'],
  changed: ['changed'],
};

const CURSOR = z.strictObject({ at: z.string(), rank: z.number(), tie: z.string() });

const ROW = z.object({
  kind: z.enum(RECENT_KINDS),
  ref: z.string(),
  at: z.string(),
  rank: z.number(),
  tie: z.string(),
  actor: z.string().nullable(),
  via: z.string().nullable(),
  device: z.string().nullable(),
});

interface Arm {
  readonly scope: string;
  readonly cursored: boolean;
}

const AFTER = '< ($cursorAt, $cursorRank, $cursorTie)';

const FEED_TIE = "printf('%020d', f.seq)";

function feedArm(kind: 'added' | 'changed', rank: number, where: string, arm: Arm): string {
  const after = arm.cursored ? `and (f.at, ${String(rank)}, ${FEED_TIE}) ${AFTER}` : '';
  return `select * from (
    select '${kind}' as kind, f.item_id as ref, f.at as at, ${String(rank)} as rank,
      ${FEED_TIE} as tie, f.actor_profile_id as actor, f.via as via, f.device_id as device
    from drive_feed f
    join drive_items i on i.id = f.item_id
    join drive_roots r on r.id = i.root_id
    where ${where} and ${arm.scope} ${after}
    order by f.seq desc limit $limit)`;
}

const CHANGED_OPS = '(select value from json_each($changedOps))';

function shortcutArm(cursored: boolean): string {
  return `select * from (
    select 'shortcut' as kind, s.id as ref, s.created_at as at, 3 as rank, s.id as tie,
      s.created_by as actor, s.created_via as via, null as device
    from drive_shortcuts s
    join drive_roots r on r.id = s.root_id
    left join drive_items p on p.id = s.parent_item_id
    join drive_items i on i.id = s.target_item_id
    join drive_roots ir on ir.id = i.root_id
    where ((s.parent_item_id is null and ${driveSql('r')})
        or (s.parent_item_id is not null and ${accessSql('p', 'r')}))
      and ${accessSql('i', 'ir')}
      and not exists (select 1 from drive_trash t where t.item_id = s.target_item_id)
      ${cursored ? `and (s.created_at, 3, s.id) ${AFTER}` : ''}
    order by s.created_at desc, s.id desc limit $limit)`;
}

function armOf(kind: RecentKind, arm: Arm): string {
  switch (kind) {
    case 'opened':
      return `select * from (
        select 'opened' as kind, i.id as ref, o.opened_at as at, 0 as rank, i.id as tie,
          null as actor, null as via, null as device
        from drive_opens o
        join drive_items i on i.id = o.item_id
        join drive_roots r on r.id = i.root_id
        where o.profile_id = $profile and ${arm.scope}
          ${arm.cursored ? `and (o.opened_at, 0, i.id) ${AFTER}` : ''}
        order by o.opened_at desc, i.id desc limit $limit)`;
    case 'added':
      return feedArm('added', 1, "f.op = 'create'", arm);
    case 'changed':
      return feedArm(
        'changed',
        2,
        `f.op in ${CHANGED_OPS} and f.seq = (select max(g.seq) from drive_feed g
          where g.item_id = f.item_id and g.op in ${CHANGED_OPS})`,
        arm,
      );
    case 'shortcut':
      return shortcutArm(arm.cursored);
  }
}

export interface DriveRecentStatement {
  readonly text: string;
  readonly parameters: Record<string, SQLInputValue>;
}

export function driveRecentStatement(
  actor: DriveActor,
  query: DriveRecentQuery,
  limit: number,
): DriveRecentStatement {
  const scope = accessFilter(actor);
  const cursor = query.cursor === null ? null : decodeCursor(CURSOR, query.cursor);
  const arms = KINDS[query.filter].map((kind) =>
    armOf(kind, { scope: scope.text, cursored: cursor !== null }),
  );
  return {
    text: `select kind, ref, at, rank, tie, actor, via, device
      from (${arms.join(' union all ')})
      order by at desc, rank desc, tie desc limit $limit`,
    parameters: {
      ...scope.parameters,
      limit: limit + 1,
      ...(KINDS[query.filter].includes('changed')
        ? { changedOps: JSON.stringify(DRIVE_CHANGED_OPS) }
        : {}),
      ...(cursor === null
        ? {}
        : { cursorAt: cursor.at, cursorRank: cursor.rank, cursorTie: cursor.tie }),
    },
  };
}

export class DriveRecentReader {
  private readonly items: DriveItemsRepository;
  private readonly shortcuts: DriveShortcutsRepository;

  constructor(private readonly context: StoreContext) {
    this.items = new DriveItemsRepository(context);
    this.shortcuts = new DriveShortcutsRepository(context);
  }

  read(actor: DriveActor, query: DriveRecentQuery, limit: number): DriveRecentPage {
    const statement = driveRecentStatement(actor, query, limit);
    const rows = this.context.sql.all(ROW, statement.text, statement.parameters);
    const shown = rows.slice(0, limit);
    const last = shown.at(-1);
    return {
      entries: shown.map((row) => this.entryOf(row, actor)),
      next:
        rows.length > limit && last !== undefined
          ? encodeCursor({ at: last.at, rank: last.rank, tie: last.tie })
          : null,
    };
  }

  private entryOf(row: z.output<typeof ROW>, actor: DriveActor): DriveRecentEntry {
    if (row.kind === 'shortcut') return this.shortcutEntryOf(row, actor);
    const item = this.items.byId(row.ref, actor.profileId);
    return DRIVE_RECENT_ENTRY.parse(
      row.kind === 'opened'
        ? { kind: 'opened', item, at: row.at }
        : {
            kind: row.kind,
            item,
            at: row.at,
            actorProfileId: row.actor,
            via: row.via,
            deviceId: row.device,
          },
    );
  }

  private shortcutEntryOf(row: z.output<typeof ROW>, actor: DriveActor): DriveRecentEntry {
    const record = this.shortcuts.byId(row.ref);
    const shortcut = shortcutFrom(record, {
      state: 'available',
      item: this.items.byId(record.targetItemId, actor.profileId),
    });
    return DRIVE_RECENT_ENTRY.parse({
      kind: 'shortcut',
      shortcut,
      at: row.at,
      actorProfileId: row.actor,
      via: row.via,
      deviceId: row.device,
    });
  }
}
