import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { SQL_JSON, jsonText, type Sql } from '../sql';
import type { Migration } from './migration';

const VIEW_PAGE = 'home-map-view';

const ROW = z.object({ rowid: z.number(), page: z.string(), layout: SQL_JSON });

const VIEW_PREF = z.looseObject({
  version: z.literal(1),
  value: z.looseObject({ view: z.record(z.string(), z.string()) }),
});

const WIDGET = z.looseObject({
  options: z.looseObject({ vacuumView: z.unknown().optional() }).optional(),
});

const BOARD = z.looseObject({
  version: z.literal(2),
  classes: z.looseObject({
    compact: z.looseObject({ widgets: z.array(WIDGET) }).optional(),
    medium: z.looseObject({ widgets: z.array(WIDGET) }).optional(),
    expanded: z.looseObject({ widgets: z.array(WIDGET) }).optional(),
  }),
});

type Widget = z.output<typeof WIDGET>;

type Board = z.output<typeof BOARD>;

const CLASS_NAMES = ['compact', 'medium', 'expanded'] as const;

function movedView(stored: unknown): unknown {
  const pref = VIEW_PREF.safeParse(stored);
  if (!pref.success) return null;
  const view = Object.fromEntries(
    Object.entries(pref.data.value.view).map(([page, name]) => [
      page,
      name === 'map' ? '3d' : name,
    ]),
  );
  return { ...pref.data, version: 2, value: { ...pref.data.value, view } };
}

function widgetWithoutFlatView(widget: Widget): Widget {
  if (widget.options?.vacuumView !== '2d') return widget;
  const { vacuumView: _flat, ...options } = widget.options;
  const { options: _options, ...rest } = widget;
  return Object.keys(options).length === 0 ? rest : { ...rest, options };
}

function boardWithoutFlatViews(stored: unknown): unknown {
  const board = BOARD.safeParse(stored);
  if (!board.success) return null;
  const classes: Board['classes'] = { ...board.data.classes };
  for (const name of CLASS_NAMES) {
    const arrangement = board.data.classes[name];
    if (arrangement !== undefined)
      classes[name] = { ...arrangement, widgets: arrangement.widgets.map(widgetWithoutFlatView) };
  }
  return { ...board.data, classes };
}

export function dropFlatMapViews(sql: Sql): LogPayload {
  const rows = sql.all(ROW, 'select rowid, page, layout from layouts');
  let views = 0;
  let boards = 0;
  for (const row of rows) {
    const isView = row.page === VIEW_PAGE;
    const next = isView ? movedView(row.layout) : boardWithoutFlatViews(row.layout);
    if (next === null || jsonText(next) === jsonText(row.layout)) continue;
    sql.run(
      'drop the flat map views from a stored layout',
      'update layouts set layout = $layout where rowid = $rowid',
      { layout: jsonText(next), rowid: row.rowid },
    );
    if (isView) views += 1;
    else boards += 1;
  }
  return { layouts: rows.length, views, boards };
}

export const FLAT_MAP_VIEWS_DROP_MIGRATION: Migration = {
  version: 178,
  name: 'flat-map-views-drop',
  statements: [],
  backfill: dropFlatMapViews,
};
