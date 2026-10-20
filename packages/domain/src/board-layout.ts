import { z } from 'zod';
import { JSON_VALUE } from './values';

export const BOARD_CLASSES = ['compact', 'medium', 'expanded'] as const;

export type BoardClass = (typeof BOARD_CLASSES)[number];

export const WIDGET_SIZES = ['M', 'W', 'XL'] as const;

const RETIRED_SIZES: Readonly<Record<string, (typeof WIDGET_SIZES)[number]>> = {
  S: 'M',
  L: 'XL',
};

export const WIDGET_SIZE = z.preprocess(
  (stored) => (typeof stored === 'string' ? (RETIRED_SIZES[stored] ?? stored) : stored),
  z.enum(WIDGET_SIZES),
);

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
    M: { columns: 4, rows: 2 },
    W: { columns: 4, rows: 2 },
    XL: { columns: 4, rows: 4 },
  },
  medium: {
    M: { columns: 4, rows: 2 },
    W: { columns: 8, rows: 2 },
    XL: { columns: 8, rows: 4 },
  },
  expanded: {
    M: { columns: 6, rows: 2 },
    W: { columns: 12, rows: 2 },
    XL: { columns: 12, rows: 4 },
  },
};

export const WIDGET_KEY = z.string().regex(/^[a-z][a-z0-9_.:-]{0,119}$/, 'a lower-case widget key');

export const WIDGET_TYPE = z
  .string()
  .regex(/^[a-z][a-z0-9_.-]{0,112}$/, 'a lower-case widget type');

export const BOARD_WIDGET = z.strictObject({
  key: WIDGET_KEY,
  type: WIDGET_TYPE,
  size: WIDGET_SIZE,
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

const BOARD_ARRANGEMENTS = z.strictObject({
  compact: BOARD_ARRANGEMENT.optional(),
  medium: BOARD_ARRANGEMENT.optional(),
  expanded: BOARD_ARRANGEMENT.optional(),
});

const BOARD_CLASS = z.enum(BOARD_CLASSES);

const BOARD_FOLLOW = z
  .strictObject({
    compact: BOARD_CLASS.optional(),
    medium: BOARD_CLASS.optional(),
    expanded: BOARD_CLASS.optional(),
  })
  .refine((follow) => BOARD_CLASSES.every((board) => follow[board] !== board), {
    message: 'a size cannot follow itself',
  });

export const BOARD_SNAPSHOT = z.strictObject({
  classes: BOARD_ARRANGEMENTS,
  follow: BOARD_FOLLOW.optional(),
  added: BOARD_ARRANGEMENTS.optional(),
});

export type BoardSnapshot = z.infer<typeof BOARD_SNAPSHOT>;

export const BOARD_LAYOUT = z.strictObject({
  version: z.literal(BOARD_LAYOUT_VERSION),
  classes: BOARD_ARRANGEMENTS,
  follow: BOARD_FOLLOW.optional(),
  added: BOARD_ARRANGEMENTS.optional(),
  previous: BOARD_SNAPSHOT.optional(),
});

export type BoardLayout = z.infer<typeof BOARD_LAYOUT>;

export type BoardLayoutRead =
  | { readonly status: 'absent' }
  | { readonly status: 'stored'; readonly layout: BoardLayout }
  | { readonly status: 'invalid'; readonly reason: string };

export function readBoardLayout(stored: unknown): BoardLayoutRead {
  if (stored === null || stored === undefined) {
    return { status: 'absent' };
  }
  const current = BOARD_LAYOUT.safeParse(stored);
  if (current.success) {
    return { status: 'stored', layout: current.data };
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
  const added: BoardLayout['classes'] = {};
  for (const board of BOARD_CLASSES) {
    const arrangement = keep(layout.classes[board]);
    if (arrangement !== undefined) {
      classes[board] = arrangement;
    }
    const extra = keep(layout.added?.[board]);
    if (extra !== undefined) {
      added[board] = extra;
    }
  }
  const kept = { ...layout, classes };
  return {
    layout: layout.added === undefined ? kept : { ...kept, added },
    dropped: [...new Set(dropped)],
  };
}
