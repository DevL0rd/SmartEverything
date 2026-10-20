import type { Layout } from '@smarteverything/domain';
import type { SceneNode } from '../../model/canvas/contract';
import { programOrder } from '../../model/editor/selection';
import type { IntentEnv } from './intent-env';

export interface MovePatch {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

interface Shift {
  readonly dx: number;
  readonly dy: number;
}

const NO_SHIFT: Shift = { dx: 0, dy: 0 };

function displacements(
  patches: readonly MovePatch[],
  byId: ReadonlyMap<string, SceneNode>,
): ReadonlyMap<string, Shift> {
  const total = new Map<string, Shift>();
  for (const patch of patches) {
    const node = byId.get(patch.id);
    if (node !== undefined) total.set(patch.id, { dx: patch.x - node.x, dy: patch.y - node.y });
  }
  return total;
}

function inheritedShift(
  id: string,
  byId: ReadonlyMap<string, SceneNode>,
  total: ReadonlyMap<string, Shift>,
): Shift {
  let parent = byId.get(id)?.parentId ?? null;
  while (parent !== null) {
    const shift = total.get(parent);
    if (shift !== undefined) return shift;
    parent = byId.get(parent)?.parentId ?? null;
  }
  return NO_SHIFT;
}

function ownShifts(
  patches: readonly MovePatch[],
  byId: ReadonlyMap<string, SceneNode>,
): ReadonlyMap<string, Shift> {
  const total = displacements(patches, byId);
  const own = new Map<string, Shift>();
  for (const [id, shift] of total) {
    const inherited = inheritedShift(id, byId, total);
    const dx = shift.dx - inherited.dx;
    const dy = shift.dy - inherited.dy;
    if (dx !== 0 || dy !== 0) own.set(id, { dx, dy });
  }
  return own;
}

function shiftLayout(layout: Layout, shifts: ReadonlyMap<string, Shift>): Layout {
  const nodes = { ...layout.nodes };
  for (const [id, shift] of shifts) {
    const current = layout.nodes[id] ?? { x: 0, y: 0 };
    nodes[id] = { ...current, x: current.x + shift.dx, y: current.y + shift.dy };
  }
  return { ...layout, nodes };
}

export function moveNodes(env: IntentEnv, patches: readonly MovePatch[]): void {
  const scene = env.scene();
  if (scene.mode === 'compact') return;
  const known = new Set(programOrder(env.store.state.get().program));
  const wanted = patches.filter((patch) => known.has(patch.id));
  const byId = new Map(scene.nodes.map((node) => [node.id, node] as const));
  const shifts = ownShifts(wanted, byId);
  if (shifts.size === 0) return;
  env.store.editLayout((layout) => shiftLayout(layout, shifts));
}
