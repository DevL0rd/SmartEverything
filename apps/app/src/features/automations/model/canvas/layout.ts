import type { Layout } from '@smarteverything/domain';
import { appendTo } from '@smarteverything/domain';
import type { Acc, InsertSpot, Layouted, Rect } from './layout-types';
import { finish, newAcc, put } from './layout-types';
import { measureLane, placeColumn, placeLane } from './layout-lanes';
import {
  ADMIT_H,
  ADMIT_MAX_W,
  BAR_H,
  FAILURE_GAP,
  GAP_Y,
  SLOT_SIZE,
  STEP_W,
  TRIGGER_GAP,
  TRIGGER_SIZE,
  triggerHeight,
} from './metrics';
import type { Tree } from './tree';

export { layoutCompact } from './layout-compact';

function placeTriggers(acc: Acc, tree: Tree, x0: number): number {
  const row = tree.triggers.length * (TRIGGER_SIZE.w + TRIGGER_GAP) - TRIGGER_GAP;
  const h = Math.max(
    TRIGGER_SIZE.h,
    ...tree.triggers.map((trigger) => triggerHeight(trigger.draft.outputs.length, TRIGGER_SIZE.h)),
  );
  tree.triggers.forEach((trigger, index) => {
    const x = x0 + index * (TRIGGER_SIZE.w + TRIGGER_GAP);
    put(acc, trigger.draft.id, { x, y: 0, w: TRIGGER_SIZE.w, h }, null);
  });
  if (tree.triggers.length === 0) return 0;
  if (tree.admit === null) return h;
  const y = h + 16;
  const w = Math.min(ADMIT_MAX_W, Math.max(STEP_W, row));
  put(acc, tree.admit.id, { x: x0, y, w, h: ADMIT_H }, null);
  return y + ADMIT_H;
}

function placeHead(acc: Acc, tree: Tree, x0: number): number {
  if (tree.inputs !== null) {
    put(acc, tree.inputs.id, { x: x0, y: 0, w: STEP_W, h: BAR_H }, null);
    return BAR_H;
  }
  return placeTriggers(acc, tree, x0);
}

function placeFailure(acc: Acc, tree: Tree, x: number, y: number): void {
  const failure = tree.failure;
  const draft = failure?.draft ?? null;
  if (failure === null || draft === null) return;
  if (draft.collapsed) {
    put(acc, draft.id, { x, y, w: STEP_W, h: SLOT_SIZE.h }, null);
    return;
  }
  const measured = measureLane(failure);
  placeLane(acc, measured, { x, y, w: measured.w, h: measured.h }, null);
}

function shifted(rect: Rect, dx: number, dy: number): Rect {
  return { ...rect, x: rect.x + dx, y: rect.y + dy };
}

function followed(
  spot: InsertSpot,
  deltas: ReadonlyMap<string, { dx: number; dy: number }>,
): InsertSpot {
  const anchor = spot.before ?? spot.after ?? spot.slotId;
  const delta = anchor === null ? undefined : deltas.get(anchor);
  return delta === undefined ? spot : { ...spot, x: spot.x + delta.dx, y: spot.y + delta.dy };
}

export function applyOffsets(layouted: Layouted, layout: Layout): Layouted {
  const entries = Object.entries(layout.nodes).filter(([id]) => layouted.rects.has(id));
  if (entries.length === 0) return layouted;
  const children = new Map<string, string[]>();
  for (const [id, parent] of layouted.parents) {
    if (parent !== null) appendTo(children, parent, id);
  }
  const rects = new Map(layouted.rects);
  const deltas = new Map<string, { dx: number; dy: number }>();
  const move = (id: string, dx: number, dy: number): void => {
    const rect = rects.get(id);
    if (rect !== undefined) rects.set(id, shifted(rect, dx, dy));
    const before = deltas.get(id) ?? { dx: 0, dy: 0 };
    deltas.set(id, { dx: before.dx + dx, dy: before.dy + dy });
    for (const child of children.get(id) ?? []) move(child, dx, dy);
  };
  for (const [id, offset] of entries) move(id, offset.x, offset.y);
  const moved = { ...newAcc(), rects, parents: new Map(layouted.parents), inserts: [] };
  return { ...finish(moved), inserts: layouted.inserts.map((spot) => followed(spot, deltas)) };
}

export function layoutWide(tree: Tree, layout: Layout): Layouted {
  const acc = newAcc();
  const body = measureLane(tree.body);
  const x0 = body.leftMax;
  const headBottom = placeHead(acc, tree, x0);
  const bodyY = headBottom + GAP_Y;
  const bottom = placeColumn(acc, body, { x: x0, y: bodyY }, null);
  if (tree.exits !== null) put(acc, tree.exits.id, { x: x0, y: bottom, w: STEP_W, h: BAR_H }, null);
  const widest = Math.max(STEP_W, ...body.items.map((m) => m.w));
  placeFailure(acc, tree, x0 + widest + FAILURE_GAP, bodyY);
  return applyOffsets(finish(acc), layout);
}
