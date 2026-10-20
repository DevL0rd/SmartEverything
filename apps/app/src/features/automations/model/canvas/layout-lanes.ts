import { formatScopePath } from '@smarteverything/flow/program/paths';
import type { Item, Lane } from './tree-env';
import type { Acc, Rect } from './layout-types';
import { put } from './layout-types';
import {
  FRAME_PAD,
  GAP_VALUE_Y,
  GAP_X_VALUE,
  GAP_Y,
  HEADER_H,
  LANE_GUTTER,
  LANE_TITLE_H,
  PORT_ROW_H,
  SLOT_SIZE,
  STEP_BASE_H,
  STEP_MIN_H,
  STEP_W,
  TAIL_H,
  VALUE_SIZE,
} from './metrics';

export interface MItem {
  readonly item: Item;
  readonly w: number;
  readonly h: number;
  readonly left: number;
  readonly slotH: number;
  readonly lanes: readonly MLane[];
}

export interface MLane {
  readonly lane: Lane;
  readonly w: number;
  readonly h: number;
  readonly leftMax: number;
  readonly items: readonly MItem[];
}

export function stepHeight(portCount: number): number {
  return Math.max(STEP_MIN_H, STEP_BASE_H + portCount * PORT_ROW_H);
}

function blockWidth(item: Item): number {
  const inner =
    item.values.length === 0 ? 0 : GAP_X_VALUE + Math.max(...item.values.map(blockWidth));
  return VALUE_SIZE.w + inner;
}

function valuesHeight(item: Item): number {
  return item.values.reduce(
    (sum, value) => sum + Math.max(VALUE_SIZE.h, valuesHeight(value)) + GAP_VALUE_Y,
    -GAP_VALUE_Y,
  );
}

function leftWidth(item: Item): number {
  return item.values.length === 0 ? 0 : Math.max(...item.values.map(blockWidth)) + GAP_X_VALUE;
}

function leafSize(item: Item): { w: number; h: number } {
  if (item.draft.role === 'value') return { w: VALUE_SIZE.w, h: VALUE_SIZE.h };
  return { w: STEP_W, h: stepHeight(item.draft.ports.length) };
}

function measureItem(item: Item): MItem {
  const lanes = item.lanes.map(measureLane);
  const left = leftWidth(item);
  const laneRow = lanes.reduce((sum, lane) => sum + lane.w, 0) + LANE_GUTTER * (lanes.length - 1);
  const laneH = Math.max(0, ...lanes.map((lane) => lane.h));
  const size =
    lanes.length === 0
      ? leafSize(item)
      : { w: Math.max(STEP_W, laneRow + FRAME_PAD * 2), h: HEADER_H + FRAME_PAD * 2 + laneH };
  const values = item.values.length === 0 ? 0 : valuesHeight(item);
  return { item, ...size, left, slotH: Math.max(size.h, values), lanes };
}

export function measureLane(lane: Lane): MLane {
  const items = lane.items.map(measureItem);
  const leftMax = Math.max(0, ...items.map((m) => m.left));
  const inner = Math.max(lane.slot === null ? 0 : SLOT_SIZE.w, ...items.map((m) => m.w));
  const stack = items.reduce((sum, m) => sum + m.slotH, 0) + GAP_Y * Math.max(0, items.length - 1);
  const slot = lane.slot === null ? 0 : SLOT_SIZE.h + (items.length > 0 ? GAP_Y : 0);
  const h = LANE_TITLE_H + GAP_Y + slot + stack + TAIL_H;
  return { lane, w: FRAME_PAD * 2 + leftMax + Math.max(inner, STEP_W), h, leftMax, items };
}

interface Point {
  readonly x: number;
  readonly y: number;
}

function placeValues(acc: Acc, item: Item, at: Point, parent: string | null): void {
  let cursor = at.y;
  for (const value of item.values) {
    const x = at.x - VALUE_SIZE.w;
    put(acc, value.draft.id, { x, y: cursor, w: VALUE_SIZE.w, h: VALUE_SIZE.h }, parent);
    placeValues(acc, value, { x: x - GAP_X_VALUE, y: cursor }, parent);
    cursor += Math.max(VALUE_SIZE.h, valuesHeight(value)) + GAP_VALUE_Y;
  }
}

function placeContainer(acc: Acc, m: MItem, rect: Rect): void {
  let lx = rect.x + FRAME_PAD;
  const ly = rect.y + HEADER_H + FRAME_PAD;
  const height = Math.max(0, ...m.lanes.map((lane) => lane.h));
  for (const lane of m.lanes) {
    placeLane(acc, lane, { x: lx, y: ly, w: lane.w, h: height }, m.item.draft.id);
    lx += lane.w + LANE_GUTTER;
  }
}

export function placeLane(acc: Acc, ml: MLane, rect: Rect, parent: string | null): void {
  const draft = ml.lane.draft;
  if (draft !== null) put(acc, draft.id, rect, parent);
  const x0 = rect.x + FRAME_PAD + ml.leftMax;
  placeColumn(acc, ml, { x: x0, y: rect.y + LANE_TITLE_H + GAP_Y }, draft?.id ?? null);
}

function pushInsert(
  acc: Acc,
  ml: MLane,
  spot: { index: number; placement: 'edge' | 'slot' | 'tail'; x: number; y: number },
  ends: { after: string | null; before: string | null; slotId: string | null },
): void {
  acc.inserts.push({ scope: formatScopePath(ml.lane.path), ...spot, ...ends });
}

export function placeColumn(acc: Acc, ml: MLane, at: Point, parent: string | null): number {
  const x0 = at.x;
  let y = at.y;
  let prev: { id: string; at: number } | null = null;
  if (ml.lane.slot !== null) {
    put(acc, ml.lane.slot.id, { x: x0, y, w: SLOT_SIZE.w, h: SLOT_SIZE.h }, parent);
    pushInsert(
      acc,
      ml,
      { index: 0, placement: 'slot', x: x0 + SLOT_SIZE.w / 2, y: y + SLOT_SIZE.h / 2 },
      { after: null, before: null, slotId: ml.lane.slot.id },
    );
    y += SLOT_SIZE.h + GAP_Y;
  }
  for (const m of ml.items) {
    const id = m.item.draft.id;
    placeValues(acc, m.item, { x: x0 - GAP_X_VALUE, y }, parent);
    const rect = { x: x0, y, w: m.w, h: m.h };
    put(acc, id, rect, parent);
    if (m.lanes.length > 0) placeContainer(acc, m, rect);
    if (m.item.exec) {
      const index = prev === null ? 0 : prev.at + 1;
      pushInsert(
        acc,
        ml,
        { index, placement: 'edge', x: x0 + m.w / 2, y: y - GAP_Y / 2 },
        { after: prev?.id ?? null, before: id, slotId: null },
      );
      prev = { id, at: m.item.at };
    }
    y += m.slotH + GAP_Y;
  }
  if (prev !== null) {
    pushInsert(
      acc,
      ml,
      { index: ml.lane.length, placement: 'tail', x: x0 + STEP_W / 2, y: y - GAP_Y / 2 },
      { after: prev.id, before: null, slotId: null },
    );
  }
  return y - GAP_Y + TAIL_H;
}
