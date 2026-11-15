import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { SQL_JSON, jsonText, type Sql } from '../sql';
import { SCENE_TOOLS } from './no-scenes-programs';

export class Tally {
  private readonly counts: Record<string, number> = {};

  add(key: string, count = 1): void {
    this.counts[key] = (this.counts[key] ?? 0) + count;
  }

  payload(): LogPayload {
    return { ...this.counts };
  }
}

const SCENES_PAGE = 'automations.scenes';

const NAVIGATION_PAGES = ['navigation', 'navigation-device'] as const;

const BOARD_CLASSES = ['compact', 'medium', 'expanded'] as const;

const TEXT_ROW = z.object({ id: z.string(), text: SQL_JSON });

const LAYOUT_ROW = z.object({ rowid: z.number(), page: z.string(), layout: SQL_JSON });

const MESSAGE_ROW = z.object({ id: z.string(), embeds: SQL_JSON });

const NAMES = z.array(z.string());

const WIDGET = z.looseObject({ type: z.string() });

const ARRANGEMENT = z.looseObject({ widgets: z.array(WIDGET) });

const ARRANGEMENTS = z.looseObject({
  compact: ARRANGEMENT.optional(),
  medium: ARRANGEMENT.optional(),
  expanded: ARRANGEMENT.optional(),
});

const BOARD = z.looseObject({
  version: z.literal(2),
  classes: ARRANGEMENTS,
  added: ARRANGEMENTS.optional(),
  previous: z.looseObject({ classes: ARRANGEMENTS, added: ARRANGEMENTS.optional() }).optional(),
});

const PIN = z.looseObject({
  kind: z.literal('pin'),
  target: z.looseObject({
    kind: z.string(),
    sceneId: z.string().optional(),
    path: z.string().optional(),
  }),
});

const FOLDER = z.looseObject({ kind: z.literal('folder'), items: z.array(z.unknown()) });

const NAVIGATION = z.looseObject({ items: z.array(z.unknown()).nullable() });

const NAVIGATION_PREF = z.looseObject({ version: z.literal(1), value: NAVIGATION });

const DEVICE_PREF = z.looseObject({
  version: z.literal(1),
  value: z.looseObject({ override: NAVIGATION.nullable() }),
});

const EMBED = z.looseObject({ kind: z.string(), id: z.unknown().optional() });

const ATTACHMENT = z.looseObject({ kind: z.string(), sceneId: z.string().optional() });

type Arrangements = z.output<typeof ARRANGEMENTS>;
function movedTarget(target: z.output<typeof PIN>['target']): unknown {
  if (target.kind === 'scene')
    return { kind: 'automation', automationId: target.sceneId, focus: null };
  if (target.kind === 'page' && target.path?.startsWith(SCENES_PAGE) === true) {
    return { kind: 'page', path: 'automations' };
  }
  return null;
}

function movedEntry(entry: unknown, counts: Tally): unknown {
  const folder = FOLDER.safeParse(entry);
  if (folder.success) {
    return { ...folder.data, items: folder.data.items.map((item) => movedEntry(item, counts)) };
  }
  const pin = PIN.safeParse(entry);
  if (!pin.success) return entry;
  const target = movedTarget(pin.data.target);
  if (target === null) return entry;
  counts.add('pins');
  return { ...pin.data, target };
}

function movedItems(items: readonly unknown[] | null, counts: Tally): unknown[] | null {
  return items === null ? null : items.map((entry) => movedEntry(entry, counts));
}

function movedNavigation(page: string, stored: unknown, counts: Tally): unknown {
  if (page === 'navigation') {
    const pref = NAVIGATION_PREF.safeParse(stored);
    if (!pref.success) return null;
    return {
      ...pref.data,
      value: { ...pref.data.value, items: movedItems(pref.data.value.items, counts) },
    };
  }
  const pref = DEVICE_PREF.safeParse(stored);
  if (!pref.success || pref.data.value.override === null) return null;
  const override = pref.data.value.override;
  return {
    ...pref.data,
    value: {
      ...pref.data.value,
      override: { ...override, items: movedItems(override.items, counts) },
    },
  };
}

function automationWidgets(
  arrangements: Arrangements | undefined,
  counts: Tally,
): Arrangements | undefined {
  if (arrangements === undefined) return undefined;
  const next: Arrangements = { ...arrangements };
  for (const name of BOARD_CLASSES) {
    const arrangement = arrangements[name];
    if (arrangement === undefined) continue;
    const widgets = arrangement.widgets.map((widget) =>
      widget.type === 'scenes' ? { ...widget, type: 'automations' } : widget,
    );
    counts.add('widgets', arrangement.widgets.filter((widget) => widget.type === 'scenes').length);
    next[name] = { ...arrangement, widgets };
  }
  return next;
}

function automationBoard(stored: unknown, counts: Tally): unknown {
  const board = BOARD.safeParse(stored);
  if (!board.success) return null;
  const { classes, added, previous } = board.data;
  const nextAdded = automationWidgets(added, counts);
  const nextPrevious =
    previous === undefined
      ? undefined
      : {
          ...previous,
          classes: automationWidgets(previous.classes, counts) ?? previous.classes,
          ...(previous.added === undefined
            ? {}
            : { added: automationWidgets(previous.added, counts) }),
        };
  return {
    ...board.data,
    classes: automationWidgets(classes, counts) ?? classes,
    ...(nextAdded === undefined ? {} : { added: nextAdded }),
    ...(nextPrevious === undefined ? {} : { previous: nextPrevious }),
  };
}

export function moveLayouts(sql: Sql, counts: Tally): void {
  for (const row of sql.all(LAYOUT_ROW, 'select rowid, page, layout from layouts')) {
    const next = NAVIGATION_PAGES.some((page) => page === row.page)
      ? movedNavigation(row.page, row.layout, counts)
      : automationBoard(row.layout, counts);
    if (next === null || jsonText(next) === jsonText(row.layout)) continue;
    counts.add(
      'layouts',
      sql.run(
        'move a stored layout from scenes to automations',
        'update layouts set layout = $layout where rowid = $rowid',
        { layout: jsonText(next), rowid: row.rowid },
      ),
    );
  }
}

function movedEmbeds(embeds: readonly unknown[]): unknown[] {
  return embeds.flatMap((embed) => {
    const parsed = EMBED.safeParse(embed);
    if (!parsed.success) return [embed];
    if (parsed.data.kind === 'scenes') return [];
    return parsed.data.kind === 'scene_link'
      ? [{ ...parsed.data, kind: 'automation_link' }]
      : [embed];
  });
}

export function moveEmbeds(sql: Sql, counts: Tally): void {
  const rows = sql.all(
    MESSAGE_ROW,
    `select id, embeds from assistant_messages
     where exists (select 1 from json_each(embeds) where json_extract(value, '$.kind') in ('scenes', 'scene_link'))`,
  );
  for (const row of rows) {
    const embeds = movedEmbeds(z.array(z.unknown()).parse(row.embeds));
    counts.add(
      'messages',
      sql.run(
        'move the scene widgets of a message',
        'update assistant_messages set embeds = $embeds where id = $id',
        { id: row.id, embeds: jsonText(embeds) },
      ),
    );
  }
}

export function moveAttachments(sql: Sql, counts: Tally): void {
  const rows = sql.all(
    TEXT_ROW,
    `select id, attachments as text from planner_items
     where exists (select 1 from json_each(attachments) where json_extract(value, '$.kind') = 'scene')`,
  );
  for (const row of rows) {
    const attachments = z
      .array(z.unknown())
      .parse(row.text)
      .map((entry) => {
        const attachment = ATTACHMENT.safeParse(entry);
        if (!attachment.success || attachment.data.kind !== 'scene') return entry;
        return { kind: 'automation', automationId: attachment.data.sceneId };
      });
    counts.add(
      'attachments',
      sql.run(
        'move the scene attachments of a planner item',
        'update planner_items set attachments = $attachments where id = $id',
        { id: row.id, attachments: jsonText(attachments) },
      ),
    );
  }
}

function withoutSceneTools(text: unknown): string {
  return jsonText(NAMES.parse(text).filter((name) => !SCENE_TOOLS.has(name)));
}

export function moveTools(sql: Sql, counts: Tally): void {
  for (const row of sql.all(
    TEXT_ROW,
    "select '1' as id, mcp_disabled_tools as text from settings",
  )) {
    counts.add(
      'settings',
      sql.run(
        'drop the scene tools from the switched-off tools',
        'update settings set mcp_disabled_tools = $names',
        { names: withoutSceneTools(row.text) },
      ),
    );
  }
  for (const row of sql.all(
    TEXT_ROW,
    `select id, tools as text from ai_chats where tools is not null
     and exists (select 1 from json_each(tools) where value in ('scene_run', 'scene_find', 'scene_edit'))`,
  )) {
    counts.add(
      'chats',
      sql.run(
        'drop the scene tools from a chat’s tool grant',
        'update ai_chats set tools = $names where id = $id',
        { id: row.id, names: withoutSceneTools(row.text) },
      ),
    );
  }
}
