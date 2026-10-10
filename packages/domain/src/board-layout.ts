import { z } from 'zod';
import { JSON_VALUE } from './values';

export const BOARD_CLASSES = ['compact', 'medium', 'expanded'] as const;

export type BoardClass = (typeof BOARD_CLASSES)[number];

export const WIDGET_SIZES = ['S', 'M', 'L', 'W', 'XL'] as const;

export type WidgetSize = (typeof WIDGET_SIZES)[number];

export interface WidgetFootprint {
  readonly columns: number;
  readonly rows: number;
}

export const BOARD_COLUMNS: Readonly<Record<BoardClass, number>> = {
  compact: 4,
  medium: 8,
  expanded: 12,
};

export const WIDGET_FOOTPRINTS: Readonly<
  Record<BoardClass, Readonly<Record<WidgetSize, WidgetFootprint>>>
> = {
  compact: {
    S: { columns: 2, rows: 2 },
    M: { columns: 4, rows: 2 },
    L: { columns: 4, rows: 4 },
    W: { columns: 4, rows: 2 },
    XL: { columns: 4, rows: 4 },
  },
  medium: {
    S: { columns: 2, rows: 2 },
    M: { columns: 4, rows: 2 },
    L: { columns: 4, rows: 4 },
    W: { columns: 8, rows: 2 },
    XL: { columns: 8, rows: 4 },
  },
  expanded: {
    S: { columns: 3, rows: 2 },
    M: { columns: 6, rows: 2 },
    L: { columns: 6, rows: 4 },
    W: { columns: 12, rows: 2 },
    XL: { columns: 12, rows: 4 },
  },
};

export const WIDGET_KEY = z.string().regex(/^[a-z][a-z0-9_:-]{0,79}$/, 'a lower-case widget key');

export const WIDGET_TYPE = z.string().regex(/^[a-z][a-z0-9-]{0,39}$/, 'a lower-case widget type');

export const BOARD_WIDGET = z.strictObject({
  key: WIDGET_KEY,
  type: WIDGET_TYPE,
  size: z.enum(WIDGET_SIZES),
  options: z.record(z.string(), JSON_VALUE).optional(),
});

export type BoardWidget = z.infer<typeof BOARD_WIDGET>;

export const BOARD_ARRANGEMENT = z.strictObject({
  widgets: z
    .array(BOARD_WIDGET)
    .refine((widgets) => new Set(widgets.map((widget) => widget.key)).size === widgets.length, {
      message: 'every widget key must be unique',
    }),
});

export type BoardArrangement = z.infer<typeof BOARD_ARRANGEMENT>;

export const BOARD_LAYOUT_VERSION = 2;

export const BOARD_LAYOUT = z.strictObject({
  version: z.literal(BOARD_LAYOUT_VERSION),
  classes: z.strictObject({
    compact: BOARD_ARRANGEMENT.optional(),
    medium: BOARD_ARRANGEMENT.optional(),
    expanded: BOARD_ARRANGEMENT.optional(),
  }),
});

export type BoardLayout = z.infer<typeof BOARD_LAYOUT>;

const LEGACY_WIDGET = z.object({ id: z.string(), span: z.number(), hidden: z.boolean() });

const LEGACY_LAYOUT = z.object({
  wide: z.object({ widgets: z.array(LEGACY_WIDGET) }),
  narrow: z.object({ widgets: z.array(LEGACY_WIDGET) }),
});

const NARROW_SIZES: Readonly<Record<number, WidgetSize>> = { 1: 'S', 2: 'M' };

const WIDE_SIZES: Readonly<Record<number, WidgetSize>> = { 4: 'S', 6: 'M', 8: 'L', 12: 'W' };

function migratedArrangement(
  widgets: readonly z.infer<typeof LEGACY_WIDGET>[],
  sizes: Readonly<Record<number, WidgetSize>>,
): BoardArrangement | null {
  const migrated: BoardWidget[] = [];
  for (const widget of widgets.filter((candidate) => !candidate.hidden)) {
    const size = sizes[widget.span];
    const key = WIDGET_KEY.safeParse(widget.id);
    const type = WIDGET_TYPE.safeParse(widget.id.replaceAll('_', '-'));
    if (size === undefined || !key.success || !type.success) {
      return null;
    }
    migrated.push({ key: key.data, type: type.data, size });
  }
  return BOARD_ARRANGEMENT.safeParse({ widgets: migrated }).success ? { widgets: migrated } : null;
}

export function migrateLayout(stored: unknown): BoardLayout | null {
  const legacy = LEGACY_LAYOUT.safeParse(stored);
  if (!legacy.success) {
    return null;
  }
  const compact = migratedArrangement(legacy.data.narrow.widgets, NARROW_SIZES);
  const expanded = migratedArrangement(legacy.data.wide.widgets, WIDE_SIZES);
  if (compact === null || expanded === null) {
    return null;
  }
  return { version: BOARD_LAYOUT_VERSION, classes: { compact, expanded } };
}

export const RENAMED_WIDGET_TYPES: Readonly<Record<string, string>> = { 'weigh-in': 'body' };

function renamedArrangement(arrangement: BoardArrangement): BoardArrangement {
  const seen = new Set<string>();
  const widgets: BoardWidget[] = [];
  for (const widget of arrangement.widgets) {
    const type = RENAMED_WIDGET_TYPES[widget.type] ?? widget.type;
    const unique =
      type === widget.type || !arrangement.widgets.some((other) => other.type === type);
    if (unique && !seen.has(widget.key)) {
      seen.add(widget.key);
      widgets.push({ ...widget, type });
    }
  }
  return { widgets };
}

function renamedTypes(layout: BoardLayout): {
  readonly layout: BoardLayout;
  readonly changed: boolean;
} {
  const classes: BoardLayout['classes'] = {};
  let changed = false;
  for (const board of BOARD_CLASSES) {
    const arrangement = layout.classes[board];
    if (arrangement !== undefined) {
      const renamed = renamedArrangement(arrangement);
      changed ||=
        renamed.widgets.length !== arrangement.widgets.length ||
        renamed.widgets.some((widget, index) => widget.type !== arrangement.widgets[index]?.type);
      classes[board] = renamed;
    }
  }
  return { layout: { version: BOARD_LAYOUT_VERSION, classes }, changed };
}

export type BoardLayoutRead =
  | { readonly status: 'absent' }
  | { readonly status: 'stored'; readonly layout: BoardLayout; readonly migrated: boolean }
  | { readonly status: 'invalid'; readonly reason: string };

export function readBoardLayout(stored: unknown): BoardLayoutRead {
  if (stored === null || stored === undefined) {
    return { status: 'absent' };
  }
  const current = BOARD_LAYOUT.safeParse(stored);
  if (current.success) {
    const renamed = renamedTypes(current.data);
    return { status: 'stored', layout: renamed.layout, migrated: renamed.changed };
  }
  const migrated = migrateLayout(stored);
  if (migrated !== null) {
    return { status: 'stored', layout: migrated, migrated: true };
  }
  return {
    status: 'invalid',
    reason: `The saved layout is not a version 2 layout: ${current.error.message}`,
  };
}

export interface KnownWidgets {
  readonly layout: BoardLayout;
  readonly dropped: readonly string[];
}

export function withKnownWidgets(layout: BoardLayout, known: ReadonlySet<string>): KnownWidgets {
  const dropped: string[] = [];
  const keep = (arrangement: BoardArrangement | undefined): BoardArrangement | undefined => {
    if (arrangement === undefined) {
      return undefined;
    }
    const widgets = arrangement.widgets.filter((widget) => known.has(widget.type));
    dropped.push(
      ...arrangement.widgets
        .filter((widget) => !known.has(widget.type))
        .map((widget) => widget.type),
    );
    return { widgets };
  };
  const classes: BoardLayout['classes'] = {};
  for (const board of BOARD_CLASSES) {
    const arrangement = keep(layout.classes[board]);
    if (arrangement !== undefined) {
      classes[board] = arrangement;
    }
  }
  return { layout: { version: BOARD_LAYOUT_VERSION, classes }, dropped: [...new Set(dropped)] };
}

export function withArrangementFor(
  layout: BoardLayout,
  board: BoardClass,
  arrangement: BoardArrangement,
): BoardLayout {
  return { version: BOARD_LAYOUT_VERSION, classes: { ...layout.classes, [board]: arrangement } };
}
