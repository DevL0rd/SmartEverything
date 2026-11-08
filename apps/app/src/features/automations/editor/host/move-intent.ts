import type { Layout, NodeLayout } from '@smarteverything/domain';
import { layoutGraph } from '@smarteverything/flow/graph/layout';
import { z } from 'zod';
import {
  plural,
  refuse,
  type Applied,
  type GraphDocument,
  type IntentRuntime,
  type Planned,
} from './intent-env';

export const MOVE_REQUEST = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('drag'),
    moves: z.array(z.strictObject({ id: z.string().min(1), x: z.number(), y: z.number() })).min(1),
  }),
  z.strictObject({
    kind: z.literal('nudge'),
    ids: z.array(z.string().min(1)).min(1),
    dx: z.number(),
    dy: z.number(),
  }),
]);

export type MoveRequest = z.infer<typeof MOVE_REQUEST>;

interface Placement {
  readonly id: string;
  readonly x: number;
  readonly y: number;
}

export const MOVED_NOTHING = 'Nothing moved.';

function spotOf(layout: Layout, id: string): { x: number; y: number } | undefined {
  return layout.nodes[id] ?? layout.comments.find((comment) => comment.id === id);
}

function placementsOf(layout: Layout, request: MoveRequest): readonly Placement[] {
  if (request.kind === 'drag') {
    return request.moves.filter((move) => spotOf(layout, move.id) !== undefined);
  }
  return request.ids.flatMap((id) => {
    const at = spotOf(layout, id);
    return at === undefined ? [] : [{ id, x: at.x + request.dx, y: at.y + request.dy }];
  });
}

function movedLayout(layout: Layout, placements: readonly Placement[]): Layout {
  const nodes = { ...layout.nodes };
  let changed = false;
  for (const { id, x, y } of placements) {
    const current = layout.nodes[id];
    if (current === undefined || (current.x === x && current.y === y)) continue;
    nodes[id] = { ...current, x, y };
    changed = true;
  }
  const comments = layout.comments.map((comment) => {
    const hit = placements.find((placement) => placement.id === comment.id);
    if (hit === undefined || (hit.x === comment.x && hit.y === comment.y)) return comment;
    changed = true;
    return { ...comment, x: hit.x, y: hit.y };
  });
  return changed ? { ...layout, nodes, comments } : layout;
}

export function planMove(doc: GraphDocument, request: MoveRequest): Planned {
  const placements = placementsOf(doc.layout, request);
  const count = plural(placements.length, 'step', 'steps');
  return {
    ok: true,
    ops: [],
    layout: (_applied: Applied, layout: Layout) => movedLayout(layout, placements),
    unchanged: MOVED_NOTHING,
    message: () => ({ announcement: `Moved ${count}.` }),
  };
}

function sameSpot(a: NodeLayout | undefined, b: NodeLayout): boolean {
  return a?.x === b.x && a.y === b.y && a.collapsed === b.collapsed;
}

function tidied(layout: Layout, nodes: Layout['nodes']): Layout {
  const merged: Record<string, NodeLayout> = { ...layout.nodes };
  let changed = false;
  for (const [id, at] of Object.entries(nodes)) {
    const collapsed = layout.nodes[id]?.collapsed;
    const next = collapsed === undefined ? at : { ...at, collapsed };
    if (sameSpot(layout.nodes[id], next)) continue;
    merged[id] = next;
    changed = true;
  }
  return changed ? { ...layout, nodes: merged } : layout;
}

export function planTidy(doc: GraphDocument, rt: IntentRuntime): Planned {
  const result = layoutGraph(doc.program, {
    kinds: rt.kinds,
    direction: rt.direction,
    density: rt.density,
    sizes: rt.sizes,
  });
  if (result.problemCount > 0) {
    return refuse(`Fix ${plural(result.problemCount, 'problem', 'problems')} to tidy everything.`);
  }
  return {
    ok: true,
    ops: [],
    layout: (_applied, layout) => tidied(layout, result.nodes),
    unchanged: 'Already tidy.',
    message: () => ({ announcement: 'Tidied up the layout.' }),
  };
}
