import {
  execPortsOf,
  type Layout,
  type NodeKindLookup,
  type NodeLayout,
  type ProgramV4,
} from '@smarteverything/domain';
import { layoutGraph, type LayoutOptions } from './layout';
import { EXEC_IN_Y, programSizes } from './metrics';

const LEVEL = 3;

export type LayoutFault = 'missing' | 'overlap' | 'on-exec-line';

interface Card {
  readonly id: string;
  readonly m: number;
  readonly c: number;
  readonly main: number;
  readonly cross: number;
}

function idsOf(program: ProgramV4): readonly string[] {
  const triggers = program.kind === 'automation' ? program.triggers : [];
  return [...program.nodes.map((node) => node.id), ...triggers.map((trigger) => trigger.id)];
}

function cardsOf(program: ProgramV4, layout: Layout, options: LayoutOptions): readonly Card[] {
  const sizes = programSizes(program, options.density ?? 'touch', options.kinds);
  const ltr = options.direction === 'ltr';
  return idsOf(program).flatMap((id) => {
    const at = layout.nodes[id];
    const size = sizes.get(id);
    if (at === undefined || size === undefined) return [];
    return ltr
      ? [{ id, m: at.x, c: at.y, main: size.w, cross: size.h }]
      : [{ id, m: at.y, c: at.x, main: size.h, cross: size.w }];
  });
}

function overlapping(cards: readonly Card[]): boolean {
  const sorted = [...cards].sort((a, b) => a.m - b.m);
  return sorted.some((card, index) => {
    for (const other of sorted.slice(index + 1)) {
      if (other.m >= card.m + card.main) return false;
      if (other.c < card.c + card.cross && card.c < other.c + other.cross) return true;
    }
    return false;
  });
}

function onLine(from: Card, to: Card, cards: readonly Card[]): boolean {
  const line = from.c + EXEC_IN_Y;
  const left = from.m + from.main;
  return cards.some(
    (card) =>
      card.id !== from.id &&
      card.id !== to.id &&
      card.m < to.m &&
      card.m + card.main > left &&
      card.c < line &&
      card.c + card.cross > line,
  );
}

function lineCrossed(program: ProgramV4, cards: readonly Card[], kinds: NodeKindLookup): boolean {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const idByKey = new Map(program.nodes.map((node) => [node.key, node.id]));
  return program.nodes.some((node) => {
    const from = byId.get(node.id);
    if (from === undefined) return false;
    return execPortsOf(node.kind, node, kinds).outputs.some((out) => {
      const id = out.target === undefined ? undefined : idByKey.get(out.target);
      const to = id === undefined ? undefined : byId.get(id);
      if (to === undefined || out.role !== 'next') return false;
      const level = Math.abs(to.c - from.c) < LEVEL && to.m > from.m + from.main;
      return level && onLine(from, to, cards);
    });
  });
}

export function layoutFault(
  program: ProgramV4,
  layout: Layout,
  options: LayoutOptions,
): LayoutFault | undefined {
  const cards = cardsOf(program, layout, options);
  if (cards.length < idsOf(program).length) return 'missing';
  if (overlapping(cards)) return 'overlap';
  return lineCrossed(program, cards, options.kinds) ? 'on-exec-line' : undefined;
}

function keepCollapsed(stored: NodeLayout | undefined, at: NodeLayout): NodeLayout {
  return stored?.collapsed === undefined ? at : { ...at, collapsed: stored.collapsed };
}

export function shownLayout(program: ProgramV4, layout: Layout, options: LayoutOptions): Layout {
  if (layoutFault(program, layout, options) === undefined) return layout;
  const placed = layoutGraph(program, options).nodes;
  const nodes: Record<string, NodeLayout> = { ...layout.nodes };
  for (const [id, at] of Object.entries(placed)) nodes[id] = keepCollapsed(layout.nodes[id], at);
  return { ...layout, nodes };
}
