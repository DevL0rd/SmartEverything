import { formatScopePath } from '@smarteverything/flow/program/paths';
import type { Acc, Layouted } from './layout-types';
import { finish, newAcc, put } from './layout-types';
import { stepHeight } from './layout-lanes';
import { COMPACT, MIN_CANVAS_WIDTH, triggerHeight } from './metrics';
import type { Tree } from './tree';
import type { Item, Lane } from './tree-env';

export function isCompactLeaf(item: Item): boolean {
  return item.lanes.length === 0 || item.draft.depth >= COMPACT.nestingLimit;
}

function flatValues(item: Item): readonly Item[] {
  return item.values.flatMap((value) => [...flatValues(value), value]);
}

interface Box {
  readonly x: number;
  readonly w: number;
  readonly y: number;
}

function placeValueCards(acc: Acc, item: Item, box: Box, parent: string | null): number {
  let cursor = box.y;
  for (const value of flatValues(item)) {
    put(
      acc,
      value.draft.id,
      {
        x: box.x + COMPACT.valueIndent,
        y: cursor,
        w: box.w - COMPACT.valueIndent,
        h: COMPACT.valueH,
      },
      parent,
    );
    cursor += COMPACT.valueH + COMPACT.valueGap;
  }
  return cursor;
}

function placeBand(acc: Acc, lane: Lane, box: Box, parent: string | null): number {
  const top = box.y + COMPACT.laneTitleH + COMPACT.gapY;
  const bottom = placeItems(acc, lane, { x: box.x, w: box.w, y: top }, lane.draft?.id ?? parent);
  if (lane.draft !== null) {
    put(acc, lane.draft.id, { x: box.x, y: box.y, w: box.w, h: bottom - box.y }, parent);
  }
  return bottom;
}

function placeContainer(acc: Acc, item: Item, box: Box): number {
  let y = box.y + COMPACT.stepH + COMPACT.pad;
  for (const lane of item.lanes) {
    y = placeBand(
      acc,
      lane,
      { x: box.x + COMPACT.pad, w: box.w - COMPACT.pad * 2, y },
      item.draft.id,
    );
    y += COMPACT.pad;
  }
  return y;
}

interface Prev {
  readonly id: string;
  readonly at: number;
}

function placeSlot(acc: Acc, lane: Lane, box: Box, parent: string | null): number {
  if (lane.slot === null) return box.y;
  put(acc, lane.slot.id, { x: box.x, y: box.y, w: box.w, h: COMPACT.slotH }, parent);
  acc.inserts.push({
    scope: formatScopePath(lane.path),
    index: 0,
    placement: 'slot',
    x: box.x + box.w / 2,
    y: box.y + COMPACT.slotH / 2,
    after: null,
    before: null,
    slotId: lane.slot.id,
  });
  return box.y + COMPACT.slotH + COMPACT.gapY;
}

function placeItems(acc: Acc, lane: Lane, box: Box, parent: string | null): number {
  let y = placeSlot(acc, lane, box, parent);
  let prev: Prev | null = null;
  const scope = formatScopePath(lane.path);
  const rail = box.x + COMPACT.rail;
  for (const item of lane.items) {
    const top = y;
    const cardY = placeValueCards(acc, item, { ...box, y }, parent);
    const bottom = placeCard(acc, item, { ...box, y: cardY }, parent);
    if (item.exec) {
      acc.inserts.push({
        scope,
        index: prev === null ? 0 : prev.at + 1,
        placement: 'edge',
        x: rail,
        y: top - COMPACT.gapY / 2,
        after: prev?.id ?? null,
        before: item.draft.id,
        slotId: null,
      });
      prev = { id: item.draft.id, at: item.at };
    }
    y = bottom + COMPACT.gapY;
  }
  if (prev !== null) {
    acc.inserts.push({
      scope,
      index: lane.length,
      placement: 'tail',
      x: rail,
      y: y - COMPACT.gapY / 2,
      after: prev.id,
      before: null,
      slotId: null,
    });
  }
  return y;
}

function placeCard(acc: Acc, item: Item, box: Box, parent: string | null): number {
  const id = item.draft.id;
  if (isCompactLeaf(item)) {
    const h = item.draft.role === 'value' ? COMPACT.valueH : stepHeight(item.draft.ports.length);
    put(acc, id, { x: box.x, y: box.y, w: box.w, h }, parent);
    return box.y + h;
  }
  const bottom = placeContainer(acc, item, box);
  put(acc, id, { x: box.x, y: box.y, w: box.w, h: bottom - box.y }, parent);
  return bottom;
}

function placeHead(acc: Acc, tree: Tree, w: number): number {
  let y = 0;
  if (tree.inputs !== null) {
    put(acc, tree.inputs.id, { x: 0, y, w, h: COMPACT.stepH }, null);
    return COMPACT.stepH;
  }
  const count = tree.triggers.length;
  if (count === 0) return 0;
  const heights = tree.triggers.map((trigger) =>
    triggerHeight(trigger.draft.outputs.length, COMPACT.triggerH),
  );
  if (tree.group !== null) {
    const inner = heights.reduce((sum, h) => sum + h + COMPACT.valueGap, 0);
    const h = COMPACT.groupTitleH + inner + COMPACT.pad;
    put(acc, tree.group.id, { x: 0, y, w, h }, null);
    let ty = COMPACT.groupTitleH;
    tree.triggers.forEach((trigger, index) => {
      const th = heights[index] ?? COMPACT.triggerH;
      put(
        acc,
        trigger.draft.id,
        { x: COMPACT.pad, y: ty, w: w - COMPACT.pad * 2, h: th },
        tree.group?.id ?? null,
      );
      ty += th + COMPACT.valueGap;
    });
    y = h;
  } else {
    const only = tree.triggers[0];
    const th = heights[0] ?? COMPACT.triggerH;
    if (only !== undefined) put(acc, only.draft.id, { x: 0, y, w, h: th }, null);
    y = th;
  }
  if (tree.admit === null) return y;
  put(acc, tree.admit.id, { x: 0, y: y + COMPACT.valueGap, w, h: COMPACT.admitH }, null);
  return y + COMPACT.valueGap + COMPACT.admitH;
}

function placeFailure(acc: Acc, tree: Tree, w: number, y: number): void {
  const failure = tree.failure;
  const draft = failure?.draft ?? null;
  if (failure === null || draft === null) return;
  if (draft.collapsed) {
    put(acc, draft.id, { x: 0, y, w, h: COMPACT.slotH }, null);
    return;
  }
  placeBand(acc, failure, { x: 0, w, y }, null);
}

export function layoutCompact(tree: Tree, canvasWidth: number): Layouted {
  const acc = newAcc();
  const w = Math.max(MIN_CANVAS_WIDTH, canvasWidth) - COMPACT.gutter * 2;
  const headBottom = placeHead(acc, tree, w);
  const bodyY = headBottom + COMPACT.gapY;
  const bottom = placeItems(acc, tree.body, { x: 0, w, y: bodyY }, null);
  if (tree.exits !== null) put(acc, tree.exits.id, { x: 0, y: bottom, w, h: COMPACT.stepH }, null);
  const afterExits = tree.exits === null ? bottom : bottom + COMPACT.stepH + COMPACT.gapY;
  placeFailure(acc, tree, w, afterExits);
  return finish(acc);
}
