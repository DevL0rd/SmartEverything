import { TYPE_SCALE, type Idiom } from '../../../design/tokens';

export interface BodyBox {
  readonly width: number;
  readonly height: number;
  readonly idiom: Idiom;
}

export interface AirFit {
  readonly dial: number;
  readonly big: boolean;
  readonly labels: boolean;
}

const VERDICT_GAP = 2;

const AIR_COLUMN_GAP = 12;

const SCALE_BAR = 16;

const SCALE_LABEL_GAP = 6;

const BIG_AIR_DIAL = 150;

function verdictHeight(idiom: Idiom): number {
  const type = TYPE_SCALE[idiom];
  return type['title-2'][1] + VERDICT_GAP + type.footnote[1];
}

function scaleHeight(idiom: Idiom, labels: boolean): number {
  return SCALE_BAR + (labels ? SCALE_LABEL_GAP + TYPE_SCALE[idiom].caption[1] : 0);
}

function airDial(dial: number, labels: boolean): AirFit {
  const size = Math.max(0, Math.floor(dial));
  return { dial: size, big: size >= BIG_AIR_DIAL, labels };
}

export function airStackFit({ width, height, idiom }: BodyBox): AirFit {
  const text = verdictHeight(idiom) + scaleHeight(idiom, true) + 2 * AIR_COLUMN_GAP;
  return airDial(Math.min(width, height - text), true);
}

export function airRowFit({ width, height, idiom }: BodyBox): AirFit {
  const labelled = verdictHeight(idiom) + AIR_COLUMN_GAP + scaleHeight(idiom, true);
  return airDial(Math.min(height, width / 2), labelled <= height);
}

export interface ComfortDialFit {
  readonly stacked: boolean;
  readonly dial: number;
}

const DIAL_CELL_GAP = 12;

const INLINE_GAP = 12;

const INLINE_TEXT = 72;

const STACK_GAP = 4;

export function comfortDialFit({ width, height, idiom }: BodyBox, count: number): ComfortDialFit {
  const cells = Math.max(1, count);
  const cell = (width - (cells - 1) * DIAL_CELL_GAP) / cells;
  const type = TYPE_SCALE[idiom];
  const inline = Math.min(height, cell - INLINE_GAP - INLINE_TEXT);
  const stacked = Math.min(cell, height - STACK_GAP - type.footnote[1] - type.caption[1]);
  return inline >= stacked
    ? { stacked: false, dial: Math.max(0, Math.floor(inline)) }
    : { stacked: true, dial: Math.max(0, Math.floor(stacked)) };
}

export interface GridFit {
  readonly columns: number;
  readonly shown: number;
}

const ROOM_PAD_Y = 8;

const ROOM_PAD_X = 12;

const ROOM_TEXT_GAP = 4;

const ROOM_WELL = 28;

const ROOM_GAP = 8;

const ROOM_COLUMN_GAP = 12;

const READING_GAP = 8;

const READING_FIGURE = 84;

const READING_COLUMN_GAP = 12;

const ROOM_MIN_WIDTH =
  2 * ROOM_PAD_X + 3 * (ROOM_WELL + READING_GAP + READING_FIGURE) + 2 * READING_COLUMN_GAP;

function fittedCount(room: number, item: number, gap: number): number {
  return Math.floor((room + gap) / (item + gap));
}

function clampedColumns(width: number, least: number, gap: number, count: number): number {
  return Math.max(1, Math.min(count, fittedCount(width, least, gap)));
}

export function roomRowHeight(idiom: Idiom): number {
  return 2 * ROOM_PAD_Y + TYPE_SCALE[idiom].body[1] + ROOM_TEXT_GAP + ROOM_WELL;
}

export interface RoomGridFit extends GridFit {
  readonly wells: boolean;
}

function readingsFit(width: number, readings: number, well: number): boolean {
  const line = readings * (well + READING_FIGURE) + (readings - 1) * READING_COLUMN_GAP;
  return line <= width - 2 * ROOM_PAD_X;
}

export function roomGridFit(
  { width, height, idiom }: BodyBox,
  count: number,
  readings: number,
): RoomGridFit {
  const columns = clampedColumns(width, ROOM_MIN_WIDTH, ROOM_COLUMN_GAP, count);
  const rows = Math.max(1, fittedCount(height, roomRowHeight(idiom), ROOM_GAP));
  const room = (width - (columns - 1) * ROOM_COLUMN_GAP) / columns;
  return {
    columns,
    shown: Math.min(count, rows * columns),
    wells: readingsFit(room, readings, ROOM_WELL + READING_GAP),
  };
}

export interface OutdoorFit extends GridFit {
  readonly hintLines: number;
}

const OUTDOOR_HEAD = 28;

const OUTDOOR_INNER_GAP = 4;

const OUTDOOR_ROW_GAP = 12;

const OUTDOOR_COLUMN_GAP = 24;

const OUTDOOR_MIN_WIDTH = 184;

const HINT_LINES = 2;

export function outdoorMetricHeight(idiom: Idiom): number {
  return OUTDOOR_HEAD + 2 * (OUTDOOR_INNER_GAP + TYPE_SCALE[idiom].callout[1]);
}

function stackHeight(rows: number, item: number, gap: number): number {
  return rows === 0 ? 0 : rows * item + (rows - 1) * gap;
}

export function outdoorFit({ width, height, idiom }: BodyBox, count: number): OutdoorFit {
  const metric = outdoorMetricHeight(idiom);
  const columns = clampedColumns(width, OUTDOOR_MIN_WIDTH, OUTDOOR_COLUMN_GAP, count);
  const rows = Math.max(1, fittedCount(height, metric, OUTDOOR_ROW_GAP));
  const shown = Math.min(count, rows * columns);
  const used = stackHeight(Math.ceil(shown / columns), metric, OUTDOOR_ROW_GAP);
  const left = height - used - (shown === 0 ? 0 : OUTDOOR_ROW_GAP);
  const hintLines = Math.max(
    0,
    Math.min(HINT_LINES, Math.floor(left / TYPE_SCALE[idiom].callout[1])),
  );
  return { columns, shown, hintLines };
}

export interface SupplyListFit extends GridFit {
  readonly more: number;
}

const SUPPLY_LINE = 36;

const SUPPLY_ROW_GAP = 12;

const SUPPLY_COLUMN_GAP = 20;

const SUPPLY_MIN_WIDTH = 200;

export function supplyListFit({ width, height, idiom }: BodyBox, count: number): SupplyListFit {
  const columns = clampedColumns(width, SUPPLY_MIN_WIDTH, SUPPLY_COLUMN_GAP, count);
  if (stackHeight(Math.ceil(count / columns), SUPPLY_LINE, SUPPLY_ROW_GAP) <= height) {
    return { columns, shown: count, more: 0 };
  }
  const room = height - TYPE_SCALE[idiom].footnote[1] - SUPPLY_ROW_GAP;
  const rows = Math.max(1, fittedCount(room, SUPPLY_LINE, SUPPLY_ROW_GAP));
  const shown = Math.min(count, rows * columns);
  return { columns, shown, more: count - shown };
}

const RING_GAP = 16;

const RING_TEXT_GAP = 8;

const RING_CELL_LEAST = 104;

const RING_LEAST = 96;

const RING_STROKE_SHARE = 12;

export interface RingFit {
  readonly ring: number;
  readonly thickness: number;
}

export function supplyRingFit({ width, height, idiom }: BodyBox, count: number): RingFit | null {
  if (count === 0) {
    return null;
  }
  const cell = (width - (count - 1) * RING_GAP) / count;
  const type = TYPE_SCALE[idiom];
  const text = type.body[1] + type.footnote[1] + type.caption[1];
  const ring = Math.floor(Math.min(cell, height - RING_TEXT_GAP - text));
  if (cell < RING_CELL_LEAST || ring < RING_LEAST) {
    return null;
  }
  return { ring, thickness: Math.round(ring / RING_STROKE_SHARE) };
}

export function rowsOf<T>(items: readonly T[], columns: number): readonly (readonly T[])[] {
  return Array.from({ length: Math.ceil(items.length / columns) }, (_, row) =>
    items.slice(row * columns, (row + 1) * columns),
  );
}
