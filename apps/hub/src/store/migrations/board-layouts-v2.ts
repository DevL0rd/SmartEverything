import type { LogPayload } from '@smarteverything/logging';
import { z } from 'zod';
import { SQL_JSON, jsonText, type Sql } from '../sql';

const WIDGET_KEY = /^[a-z][a-z0-9_:-]{0,79}$/;

const WIDGET_TYPE = /^[a-z][a-z0-9-]{0,39}$/;

const LAYOUT_VERSION = 2;

const RENAMED_TYPES: Readonly<Record<string, string>> = { 'weigh-in': 'body' };

const NARROW_SIZES: Readonly<Record<number, string>> = { 1: 'S', 2: 'M' };

const WIDE_SIZES: Readonly<Record<number, string>> = { 4: 'S', 6: 'M', 8: 'L', 12: 'W' };

const CLASS_NAMES = ['compact', 'medium', 'expanded'] as const;

const ROW = z.object({ rowid: z.number(), layout: SQL_JSON });

const LEGACY_WIDGET = z.object({ id: z.string(), span: z.number(), hidden: z.boolean() });

const LEGACY_LAYOUT = z.object({
  wide: z.object({ widgets: z.array(LEGACY_WIDGET) }),
  narrow: z.object({ widgets: z.array(LEGACY_WIDGET) }),
});

const WIDGET = z.looseObject({ key: z.string(), type: z.string() });

type Widget = z.output<typeof WIDGET>;

const CURRENT_LAYOUT = z.looseObject({
  version: z.literal(LAYOUT_VERSION),
  classes: z.looseObject({
    compact: z.looseObject({ widgets: z.array(WIDGET) }).optional(),
    medium: z.looseObject({ widgets: z.array(WIDGET) }).optional(),
    expanded: z.looseObject({ widgets: z.array(WIDGET) }).optional(),
  }),
});

type Layout = z.output<typeof CURRENT_LAYOUT>;

function widgetsOf(
  legacy: readonly z.output<typeof LEGACY_WIDGET>[],
  sizes: Readonly<Record<number, string>>,
): Widget[] | null {
  const widgets: Widget[] = [];
  for (const widget of legacy.filter((candidate) => !candidate.hidden)) {
    const size = sizes[widget.span];
    const type = widget.id.replaceAll('_', '-');
    if (size === undefined || !WIDGET_KEY.test(widget.id) || !WIDGET_TYPE.test(type)) {
      return null;
    }
    widgets.push({ key: widget.id, type, size });
  }
  const keys = new Set(widgets.map((widget) => widget.key));
  return keys.size === widgets.length ? widgets : null;
}

function fromLegacy(stored: unknown): Layout | null {
  const legacy = LEGACY_LAYOUT.safeParse(stored);
  if (!legacy.success) {
    return null;
  }
  const compact = widgetsOf(legacy.data.narrow.widgets, NARROW_SIZES);
  const expanded = widgetsOf(legacy.data.wide.widgets, WIDE_SIZES);
  if (compact === null || expanded === null) {
    return null;
  }
  return {
    version: LAYOUT_VERSION,
    classes: { compact: { widgets: compact }, expanded: { widgets: expanded } },
  };
}

function renamedWidgets(widgets: readonly Widget[]): Widget[] {
  const seen = new Set<string>();
  const renamed: Widget[] = [];
  for (const widget of widgets) {
    const type = RENAMED_TYPES[widget.type] ?? widget.type;
    const unique = type === widget.type || !widgets.some((other) => other.type === type);
    if (unique && !seen.has(widget.key)) {
      seen.add(widget.key);
      renamed.push({ ...widget, type });
    }
  }
  return renamed;
}

function renamedLayout(layout: Layout): Layout {
  const classes: Layout['classes'] = {};
  for (const name of CLASS_NAMES) {
    const arrangement = layout.classes[name];
    if (arrangement !== undefined) {
      classes[name] = { ...arrangement, widgets: renamedWidgets(arrangement.widgets) };
    }
  }
  return { ...layout, classes };
}

function currentLayout(stored: unknown): Layout | null {
  const current = CURRENT_LAYOUT.safeParse(stored);
  return current.success ? current.data : fromLegacy(stored);
}

export function moveLayoutsToV2(sql: Sql): LogPayload {
  const rows = sql.all(ROW, 'select rowid, layout from layouts');
  let rewritten = 0;
  for (const row of rows) {
    const layout = currentLayout(row.layout);
    if (layout === null) {
      continue;
    }
    const next = renamedLayout(layout);
    if (jsonText(next) !== jsonText(row.layout)) {
      sql.run(
        'rewrite a stored layout as version 2',
        'update layouts set layout = $layout where rowid = $rowid',
        {
          layout: jsonText(next),
          rowid: row.rowid,
        },
      );
      rewritten += 1;
    }
  }
  return { layouts: rows.length, rewritten };
}
