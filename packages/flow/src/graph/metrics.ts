import {
  execClassOf,
  execPortsOf,
  type ExecOutput,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import {
  pinRowsHeight,
  referencedOf,
  referencedOutputs,
  startRowsHeight,
  valueCardHeight,
  VALUE_HEAD_H,
  VALUE_ROW_H,
  type ReferencedOutputs,
} from './pin-metrics';

export type Density = 'pointer' | 'touch';

export type Direction = 'ltr' | 'ttb';

export interface Size {
  readonly w: number;
  readonly h: number;
}

export type CardClass =
  | 'step'
  | 'decision'
  | 'fork'
  | 'try'
  | 'loop'
  | 'owner'
  | 'join'
  | 'terminal'
  | 'start'
  | 'failure'
  | 'value';

export const CARD_WIDTH: Readonly<Record<CardClass, number>> = {
  step: 248,
  decision: 280,
  fork: 280,
  try: 280,
  loop: 300,
  owner: 248,
  join: 248,
  terminal: 200,
  start: 200,
  failure: 200,
  value: 212,
};

export const ROW_H: Readonly<Record<Density, number>> = { pointer: 40, touch: 48 };

export const VALUE_SIZE: Size = { w: 212, h: VALUE_HEAD_H + VALUE_ROW_H };

export const TRIGGER_SIZE: Size = { w: 248, h: 76 };

export const HEADER_H = 56;

export const STEP_MIN_H = 68;

export const EXEC_IN_Y = HEADER_H / 2;

export const TERMINAL_H = 56;

export const END_CAP_W = 120;

export const JOIN_PIN_PITCH = 24;

export const JOIN_PAD = 16;

export const GAP = {
  sequence: 52,
  branch: 32,
  value: 32,
  valueStack: 12,
  valueAbove: 24,
  trigger: 24,
  failure: 64,
} as const;

const LOOP_KINDS: ReadonlySet<string> = new Set([
  'flow.for_each',
  'flow.repeat',
  'flow.for_range',
  'flow.while',
  'flow.do_until',
  'flow.forever',
]);

export function cardClassOf(kindId: string, kinds: NodeKindLookup): CardClass {
  const execClass = execClassOf(kindId, kinds);
  if (execClass === 'owner') {
    if (kindId === 'flow.try') return 'try';
    return LOOP_KINDS.has(kindId) ? 'loop' : 'owner';
  }
  return execClass;
}

function rowCount(card: CardClass, outputs: readonly ExecOutput[]): number {
  if (card === 'step') return Math.max(0, outputs.length - 1);
  if (card === 'fork') return outputs.length + 1;
  return outputs.length;
}

export function joinSize(paths: number): Size {
  const pins = (Math.max(paths, 1) + 1) * JOIN_PIN_PITCH + JOIN_PAD * 2;
  return { w: CARD_WIDTH.join, h: Math.max(HEADER_H, pins) };
}

export function cardSize(card: CardClass, outputs: readonly ExecOutput[], density: Density): Size {
  const w = CARD_WIDTH[card];
  const rows = rowCount(card, outputs) * ROW_H[density];
  if (card === 'value') return VALUE_SIZE;
  if (card === 'step') return { w, h: STEP_MIN_H + rows };
  if (card === 'terminal' || card === 'start' || card === 'failure') return { w, h: TERMINAL_H };
  return { w, h: HEADER_H + rows };
}

export function nodeSize(
  node: GraphNode,
  density: Density,
  kinds: NodeKindLookup,
  paths = 1,
): Size {
  const card = cardClassOf(node.kind, kinds);
  if (card === 'join') return joinSize(paths);
  return cardSize(card, execPortsOf(node.kind, node, kinds).outputs, density);
}

function wiresOf(node: GraphNode): readonly string[] {
  const rows = [
    ...(node.branches ?? []),
    ...(node.cases ?? []),
    ...(node.catches ?? []),
    ...(node.paths ?? []),
  ];
  const targets = [...Object.values(node.to ?? {}), ...rows.map((row) => row.to)];
  return targets.filter((target) => target !== undefined);
}

function pathsInto(program: ProgramV4, join: GraphNode): number {
  return program.nodes.flatMap(wiresOf).filter((target) => target === join.key).length;
}

function taller(size: Size, by: number): Size {
  return by === 0 ? size : { w: size.w, h: size.h + by };
}

interface Sizing {
  readonly program: ProgramV4;
  readonly density: Density;
  readonly referenced: ReferencedOutputs;
  readonly kinds: NodeKindLookup;
}

function sizeOf(node: GraphNode, sizing: Sizing): Size {
  const { program, density, referenced, kinds } = sizing;
  const card = cardClassOf(node.kind, kinds);
  const wired = referencedOf(referenced, node.key);
  if (card === 'value') return { w: VALUE_SIZE.w, h: valueCardHeight(node, wired, kinds) };
  const paths = card === 'join' ? pathsInto(program, node) : 1;
  const pins = card === 'start' ? startRowsHeight(program) : pinRowsHeight(node, wired, kinds);
  return taller(nodeSize(node, density, kinds, paths), pins);
}

export function programSizes(
  program: ProgramV4,
  density: Density,
  kinds: NodeKindLookup,
): ReadonlyMap<string, Size> {
  const referenced = referencedOutputs(program);
  const sizes = new Map<string, Size>();
  for (const node of program.nodes)
    sizes.set(node.id, sizeOf(node, { program, density, referenced, kinds }));
  if (program.kind === 'automation') {
    for (const trigger of program.triggers) {
      const wired = referencedOf(referenced, trigger.key);
      sizes.set(trigger.id, taller(TRIGGER_SIZE, pinRowsHeight(trigger, wired, kinds)));
    }
  }
  return sizes;
}

export interface SizeOptions {
  readonly kinds: NodeKindLookup;
  readonly density?: Density;
  readonly sizes?: ReadonlyMap<string, Size>;
}

export function sizesFor(program: ProgramV4, options: SizeOptions): ReadonlyMap<string, Size> {
  const base = programSizes(program, options.density ?? 'touch', options.kinds);
  const known = options.sizes;
  if (known === undefined) return base;
  return new Map([...base].map(([id, size]) => [id, known.get(id) ?? size]));
}
