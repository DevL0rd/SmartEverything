import {
  execClassOf,
  execPortsOf,
  isExecNode,
  type GraphNode,
  type Layout,
  type NodeKindLookup,
  type NodeLayout,
  type PortValue,
  type ProgramV4,
} from '@smarteverything/domain';
import { GAP, TRIGGER_SIZE, sizesFor, type Density, type Direction, type Size } from './metrics';
import { layoutGraph } from './layout';

export interface PlaceOptions {
  readonly kinds: NodeKindLookup;
  readonly direction: Direction;
  readonly density?: Density;
  readonly sizes?: ReadonlyMap<string, Size>;
}

interface Box {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

type Anchor =
  | { readonly kind: 'after'; readonly box: Box; readonly slot: number }
  | { readonly kind: 'before'; readonly box: Box };

function boxOf(layout: Layout, sizes: ReadonlyMap<string, Size>, id: string): Box | undefined {
  const at = layout.nodes[id];
  const size = sizes.get(id);
  return at === undefined || size === undefined ? undefined : { x: at.x, y: at.y, ...size };
}

function readsOf(node: GraphNode): readonly PortValue[] {
  return [...Object.values(node.ports ?? {}), ...(node.branches ?? []).map((row) => row.when)];
}

function reads(node: GraphNode, key: string): boolean {
  return readsOf(node).some((port) => 'wire' in port && port.wire.from === key);
}

function followerAnchor(
  program: ProgramV4,
  node: GraphNode,
  boxes: (id: string) => Box | undefined,
  kinds: NodeKindLookup,
): Anchor | undefined {
  for (const pred of program.nodes) {
    const outputs = execPortsOf(pred.kind, pred, kinds).outputs;
    const slot = outputs.findIndex((out) => out.target === node.key);
    const box = boxes(pred.id);
    if (slot >= 0 && box !== undefined) return { kind: 'after', box, slot };
  }
  return undefined;
}

function consumerAnchor(
  program: ProgramV4,
  node: GraphNode,
  boxes: (id: string) => Box | undefined,
): Anchor | undefined {
  for (const reader of program.nodes) {
    const box = boxes(reader.id);
    if (reads(reader, node.key) && box !== undefined) return { kind: 'before', box };
  }
  return undefined;
}

function anchorOf(
  program: ProgramV4,
  node: GraphNode,
  boxes: (id: string) => Box | undefined,
  kinds: NodeKindLookup,
): Anchor | undefined {
  if (isExecNode(node.kind, kinds)) return followerAnchor(program, node, boxes, kinds);
  return consumerAnchor(program, node, boxes);
}

function rightOf(box: Box, slot: number, size: Size, direction: Direction): NodeLayout {
  return direction === 'ltr'
    ? { x: box.x + box.w + GAP.sequence, y: box.y + slot * (size.h + GAP.branch) }
    : { x: box.x + slot * (size.w + GAP.branch), y: box.y + box.h + GAP.sequence };
}

function leftOf(box: Box, size: Size, direction: Direction): NodeLayout {
  return direction === 'ltr'
    ? { x: box.x - GAP.value - size.w, y: box.y - GAP.valueAbove - size.h }
    : { x: box.x - GAP.valueAbove - size.w, y: box.y - GAP.value - size.h };
}

function beside(anchor: Anchor, size: Size, direction: Direction): NodeLayout {
  return anchor.kind === 'after'
    ? rightOf(anchor.box, anchor.slot, size, direction)
    : leftOf(anchor.box, size, direction);
}

function overlaps(a: Box, b: Box): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

function settled(
  at: NodeLayout,
  size: Size,
  taken: readonly Box[],
  direction: Direction,
): NodeLayout {
  let spot = at;
  for (;;) {
    const candidate = { ...spot, ...size };
    const blocker = taken.find((box) => overlaps(candidate, box));
    if (blocker === undefined) return spot;
    spot =
      direction === 'ltr'
        ? { x: spot.x, y: blocker.y + blocker.h + GAP.branch }
        : { x: blocker.x + blocker.w + GAP.branch, y: spot.y };
  }
}

function boxesOf(layout: Layout, sizes: ReadonlyMap<string, Size>, skip: string): readonly Box[] {
  return Object.keys(layout.nodes).flatMap((id) => {
    const box = id === skip ? undefined : boxOf(layout, sizes, id);
    return box === undefined ? [] : [box];
  });
}

function belowAll(taken: readonly Box[], direction: Direction): NodeLayout {
  if (taken.length === 0) return { x: 0, y: 0 };
  if (direction === 'ltr') {
    return {
      x: Math.min(...taken.map((box) => box.x)),
      y: Math.max(...taken.map((box) => box.y + box.h)) + GAP.branch,
    };
  }
  return {
    x: Math.max(...taken.map((box) => box.x + box.w)) + GAP.branch,
    y: Math.min(...taken.map((box) => box.y)),
  };
}

function nodeOf(program: ProgramV4, key: string): GraphNode {
  const node = program.nodes.find((candidate) => candidate.key === key);
  if (node === undefined) throw new Error(`there is no node with the key ${key}`);
  return node;
}

function sizeOfId(sizes: ReadonlyMap<string, Size>, id: string): Size {
  const size = sizes.get(id);
  if (size === undefined) throw new Error(`there is no size for the node ${id}`);
  return size;
}

function spotFor(
  program: ProgramV4,
  layout: Layout,
  node: GraphNode,
  options: PlaceOptions,
): NodeLayout {
  const sizes = sizesFor(program, options);
  const size = sizeOfId(sizes, node.id);
  const anchor = anchorOf(program, node, (id) => boxOf(layout, sizes, id), options.kinds);
  const taken = boxesOf(layout, sizes, node.id);
  const first =
    anchor === undefined
      ? belowAll(taken, options.direction)
      : beside(anchor, size, options.direction);
  return settled(first, size, taken, options.direction);
}

export function placeNew(
  program: ProgramV4,
  layout: Layout,
  newKey: string,
  options: PlaceOptions,
): NodeLayout {
  return spotFor(program, layout, nodeOf(program, newKey), options);
}

function triggerSpot(
  program: ProgramV4,
  layout: Layout,
  id: string,
  options: PlaceOptions,
): NodeLayout {
  const sizes = sizesFor(program, options);
  const start = program.nodes.find((node) => execClassOf(node.kind, options.kinds) === 'start');
  const box = start === undefined ? undefined : boxOf(layout, sizes, start.id);
  const taken = boxesOf(layout, sizes, id);
  const first =
    box === undefined
      ? belowAll(taken, options.direction)
      : leftOf(box, TRIGGER_SIZE, options.direction);
  return settled(first, TRIGGER_SIZE, taken, options.direction);
}

function withNode(layout: Layout, id: string, at: NodeLayout): Layout {
  return { ...layout, nodes: { ...layout.nodes, [id]: at } };
}

function nextMissing(
  program: ProgramV4,
  layout: Layout,
  missing: readonly GraphNode[],
  options: PlaceOptions,
): GraphNode | undefined {
  const sizes = sizesFor(program, options);
  const anchored = missing.find(
    (node) =>
      anchorOf(program, node, (id) => boxOf(layout, sizes, id), options.kinds) !== undefined,
  );
  return anchored ?? missing[0];
}

function nothingPlaced(program: ProgramV4, layout: Layout): boolean {
  const triggers = program.kind === 'automation' ? program.triggers : [];
  return [...program.nodes, ...triggers].every((node) => layout.nodes[node.id] === undefined);
}

export function completeLayout(program: ProgramV4, layout: Layout, options: PlaceOptions): Layout {
  if (nothingPlaced(program, layout)) {
    return { ...layout, nodes: { ...layout.nodes, ...layoutGraph(program, options).nodes } };
  }
  let current = layout;
  let missing = program.nodes.filter((node) => current.nodes[node.id] === undefined);
  for (let next = nextMissing(program, current, missing, options); next;) {
    const placedNode = next;
    current = withNode(current, placedNode.id, spotFor(program, current, placedNode, options));
    missing = missing.filter((node) => node.id !== placedNode.id);
    next = nextMissing(program, current, missing, options);
  }
  const triggers = program.kind === 'automation' ? program.triggers : [];
  for (const trigger of triggers.filter((item) => current.nodes[item.id] === undefined)) {
    current = withNode(current, trigger.id, triggerSpot(program, current, trigger.id, options));
  }
  return current;
}
