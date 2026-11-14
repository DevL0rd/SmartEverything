import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { SQL_JSON, jsonText, type Sql } from '../sql';
import type { Migration } from './migration';

const PHOTOS_PAGE = 'photos';

const NAVIGATION_PAGES = ['navigation', 'navigation-device'] as const;

const MEMORIES_PIN = 'photos-memories';

const SEARCH_PIN = 'photos-search';

const LIBRARY_PIN = 'photos';

const MOVED_PINS: Readonly<Record<string, string>> = {
  'photos-duplicates': 'settings/photos/duplicates',
  'photos-backup': 'settings/photos/backup',
};

const REMOVED_SETTINGS = [
  'photos.memories.enabled',
  'photos.memories.trip_distance',
  'photos.memories.year_in_review',
  'photos.memories.excluded',
  'photos.sources.folders',
  'photos.phones',
  'photos.backup.status',
  'photos.backup.free_up',
] as const;

const RENAMED_SETTINGS: Readonly<Record<string, string>> = {
  'photos.timeline.zoom': 'photos.library.zoom',
  'photos.timeline.group': 'photos.library.group',
  'photos.timeline.videos': 'photos.library.videos',
  'photos.timeline.not_backed_up': 'photos.library.not_backed_up',
};

const BOARD_CLASSES = ['compact', 'medium', 'expanded'] as const;

const DROPPED_PREF_KEYS = [
  'memories',
  'tripDistanceKm',
  'yearInReview',
  'excludedAlbumIds',
] as const;

const RENAMED_PREF_KEYS: Readonly<Record<string, string>> = {
  timelineZoom: 'libraryZoom',
  timelineGroup: 'libraryGroup',
};

const LAYOUT_ROW = z.object({ rowid: z.number(), page: z.string(), layout: SQL_JSON });

const MESSAGE_ROW = z.object({ id: z.string(), embeds: SQL_JSON });

const PREF = z.looseObject({
  version: z.union([z.literal(1), z.literal(2)]),
  value: z.looseObject({}),
});

const WIDGET = z.looseObject({ type: z.string() });

const ARRANGEMENT = z.looseObject({ widgets: z.array(WIDGET) });

const ARRANGEMENTS = z.looseObject({
  compact: ARRANGEMENT.optional(),
  medium: ARRANGEMENT.optional(),
  expanded: ARRANGEMENT.optional(),
});

const SNAPSHOT = z.looseObject({ classes: ARRANGEMENTS, added: ARRANGEMENTS.optional() });

const BOARD = z.looseObject({
  version: z.literal(2),
  classes: ARRANGEMENTS,
  added: ARRANGEMENTS.optional(),
  previous: SNAPSHOT.optional(),
});

const PIN_TARGET = z.looseObject({ kind: z.literal('page'), path: z.string() });

const PIN = z.looseObject({ kind: z.literal('pin'), target: z.looseObject({ kind: z.string() }) });

const FOLDER = z.looseObject({ kind: z.literal('folder'), items: z.array(z.unknown()) });

const NAVIGATION = z.looseObject({ items: z.array(z.unknown()).nullable() });

const NAVIGATION_PREF = z.looseObject({ version: z.literal(1), value: NAVIGATION });

const DEVICE_PREF = z.looseObject({
  version: z.literal(1),
  value: z.looseObject({ override: NAVIGATION.nullable() }),
});

type Arrangements = z.output<typeof ARRANGEMENTS>;

type Board = z.output<typeof BOARD>;

class Counts {
  layouts = 0;
  widgets = 0;
  pins = 0;
  messages = 0;
  embeds = 0;

  addWidgets(count: number): void {
    this.widgets += count;
  }

  addPin(): void {
    this.pins += 1;
  }

  addLayout(): void {
    this.layouts += 1;
  }

  addMessage(embeds: number): void {
    this.messages += 1;
    this.embeds += embeds;
  }

  payload(): LogPayload {
    return {
      layouts: this.layouts,
      widgets: this.widgets,
      pins: this.pins,
      messages: this.messages,
      embeds: this.embeds,
    };
  }
}

function pathOf(entry: unknown): string | null {
  const pin = PIN.safeParse(entry);
  if (!pin.success) return null;
  const target = PIN_TARGET.safeParse(pin.data.target);
  return target.success ? target.data.path : null;
}

function movedPref(stored: unknown): unknown {
  const pref = PREF.safeParse(stored);
  if (!pref.success) return null;
  const value = Object.fromEntries(
    Object.entries(pref.data.value)
      .filter(([key]) => !DROPPED_PREF_KEYS.some((dropped) => dropped === key))
      .map(([key, entry]) => [RENAMED_PREF_KEYS[key] ?? key, entry]),
  );
  return { ...pref.data, version: 3, value };
}

function withoutMemoryWidgets(
  arrangements: Arrangements | undefined,
  counts: Counts,
): Arrangements | undefined {
  if (arrangements === undefined) return undefined;
  const next: Arrangements = { ...arrangements };
  for (const name of BOARD_CLASSES) {
    const arrangement = arrangements[name];
    if (arrangement === undefined) continue;
    const widgets = arrangement.widgets.filter((widget) => widget.type !== 'photo-memories');
    counts.addWidgets(arrangement.widgets.length - widgets.length);
    next[name] = { ...arrangement, widgets };
  }
  return next;
}

function withoutMemoryBoard(board: Board, counts: Counts): Board {
  const classes = withoutMemoryWidgets(board.classes, counts) ?? board.classes;
  const added = withoutMemoryWidgets(board.added, counts);
  const previous =
    board.previous === undefined
      ? undefined
      : {
          ...board.previous,
          classes: withoutMemoryWidgets(board.previous.classes, counts) ?? board.previous.classes,
          ...(board.previous.added === undefined
            ? {}
            : { added: withoutMemoryWidgets(board.previous.added, counts) }),
        };
  return {
    ...board,
    classes,
    ...(added === undefined ? {} : { added }),
    ...(previous === undefined ? {} : { previous }),
  };
}

class PinState {
  constructor(private pinned: boolean) {}

  claimLibrary(): boolean {
    const claimed = !this.pinned;
    this.pinned = true;
    return claimed;
  }
}

function rewrittenPin(entry: unknown, state: PinState, counts: Counts): unknown[] {
  const path = pathOf(entry);
  const pin = PIN.safeParse(entry);
  if (path === null || !pin.success) return [entry];
  const moved = MOVED_PINS[path];
  if (moved !== undefined) {
    counts.addPin();
    return [{ ...pin.data, target: { ...pin.data.target, path: moved } }];
  }
  if (path === MEMORIES_PIN) {
    counts.addPin();
    return [];
  }
  if (path !== SEARCH_PIN) return [entry];
  counts.addPin();
  if (!state.claimLibrary()) return [];
  return [{ ...pin.data, target: { ...pin.data.target, path: LIBRARY_PIN } }];
}

function rewrittenNode(node: unknown, state: PinState, counts: Counts): unknown[] {
  const folder = FOLDER.safeParse(node);
  if (!folder.success) return rewrittenPin(node, state, counts);
  return [
    {
      ...folder.data,
      items: folder.data.items.flatMap((entry) => rewrittenPin(entry, state, counts)),
    },
  ];
}

function hasLibraryPin(items: readonly unknown[]): boolean {
  return items.some((node) => {
    const folder = FOLDER.safeParse(node);
    return folder.success ? hasLibraryPin(folder.data.items) : pathOf(node) === LIBRARY_PIN;
  });
}

function rewrittenItems(items: readonly unknown[] | null, counts: Counts): unknown[] | null {
  if (items === null) return null;
  const state = new PinState(hasLibraryPin(items));
  return items.flatMap((node) => rewrittenNode(node, state, counts));
}

function movedNavigation(page: string, stored: unknown, counts: Counts): unknown {
  if (page === 'navigation') {
    const pref = NAVIGATION_PREF.safeParse(stored);
    if (!pref.success) return null;
    const items = rewrittenItems(pref.data.value.items, counts);
    return { ...pref.data, value: { ...pref.data.value, items } };
  }
  const pref = DEVICE_PREF.safeParse(stored);
  if (!pref.success) return null;
  const override = pref.data.value.override;
  if (override === null) return null;
  const items = rewrittenItems(override.items, counts);
  return { ...pref.data, value: { ...pref.data.value, override: { ...override, items } } };
}

function movedLayout(row: z.output<typeof LAYOUT_ROW>, counts: Counts): unknown {
  if (row.page === PHOTOS_PAGE) return movedPref(row.layout);
  if (NAVIGATION_PAGES.some((page) => page === row.page)) {
    return movedNavigation(row.page, row.layout, counts);
  }
  const board = BOARD.safeParse(row.layout);
  if (!board.success) return null;
  return withoutMemoryBoard(board.data, counts);
}

function rewriteLayouts(sql: Sql, counts: Counts): void {
  for (const row of sql.all(LAYOUT_ROW, 'select rowid, page, layout from layouts')) {
    const next = movedLayout(row, counts);
    if (next === null || jsonText(next) === jsonText(row.layout)) continue;
    sql.run(
      'rewrite a stored layout for the Photos redesign',
      'update layouts set layout = $layout where rowid = $rowid',
      {
        layout: jsonText(next),
        rowid: row.rowid,
      },
    );
    counts.addLayout();
  }
}

const EMBED_FIELDS = z.looseObject({
  kind: z.string(),
  view: z.unknown().optional(),
  type: z.unknown().optional(),
  setting: z.unknown().optional(),
});

function isRemovedEmbed(embed: unknown): boolean {
  const parsed = EMBED_FIELDS.safeParse(embed);
  if (!parsed.success) return false;
  const { kind, view, type, setting } = parsed.data;
  if (kind === 'photos') return view === 'memory';
  if (kind === 'board') return type === 'photo-memories';
  return kind === 'setting_link' && REMOVED_SETTINGS.some((removed) => removed === String(setting));
}

function renamedEmbed(embed: unknown): unknown {
  const parsed = EMBED_FIELDS.safeParse(embed);
  if (!parsed.success || parsed.data.kind !== 'setting_link') return embed;
  const renamed = RENAMED_SETTINGS[String(parsed.data.setting)];
  return renamed === undefined ? embed : { ...parsed.data, setting: renamed };
}

const sqlList = (values: readonly string[]): string =>
  values.map((value) => `'${value}'`).join(', ');

const CHANGED_EMBED_SQL = `(json_extract(value, '$.kind') = 'photos' and json_extract(value, '$.view') = 'memory')
  or (json_extract(value, '$.kind') = 'board' and json_extract(value, '$.type') = 'photo-memories')
  or (json_extract(value, '$.kind') = 'setting_link' and json_extract(value, '$.setting') in (${sqlList([...REMOVED_SETTINGS, ...Object.keys(RENAMED_SETTINGS)])}))`;

function rewriteEmbeds(sql: Sql, counts: Counts): void {
  const rows = sql.all(
    MESSAGE_ROW,
    `select id, embeds from assistant_messages
     where exists (select 1 from json_each(embeds) where ${CHANGED_EMBED_SQL})`,
  );
  for (const row of rows) {
    const embeds = z.array(z.unknown()).parse(row.embeds);
    const kept = embeds.filter((embed) => !isRemovedEmbed(embed)).map(renamedEmbed);
    counts.addMessage(embeds.length - kept.length);
    sql.run(
      'rewrite the changed Photos embeds of a message',
      'update assistant_messages set embeds = $embeds where id = $id',
      { id: row.id, embeds: jsonText(kept) },
    );
  }
}

export function redesignPhotos(sql: Sql): LogPayload {
  const counts = new Counts();
  rewriteLayouts(sql, counts);
  rewriteEmbeds(sql, counts);
  return counts.payload();
}

export const PHOTOS_REDESIGN_MIGRATION: Migration = {
  version: 203,
  name: 'photos-redesign',
  statements: [
    `create table drive_trash_rows (
      trash_item_id text not null references drive_trash (item_id) on delete cascade,
      seq integer not null check (seq >= 0),
      table_name text not null check (length(table_name) > 0),
      row text not null check (json_valid(row)),
      primary key (trash_item_id, seq)
    ) strict, without rowid`,
  ],
  backfill: redesignPhotos,
};
