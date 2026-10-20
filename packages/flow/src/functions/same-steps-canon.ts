import type { FlowNode, PortValue, Wire } from '@smarteverything/domain';
import { childScopeRefs } from '../program/walk';

export type Side = 'pattern' | 'candidate';

export interface Frame {
  readonly ordinals: Readonly<Record<Side, ReadonlyMap<string, number>>>;
  readonly alpha: Readonly<Record<Side, Map<string, number>>>;
  readonly bindings: Map<string, string>;
}

const KEPT_ROOTS: ReadonlySet<string> = new Set(['home', 'run']);

export function stableJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value)
      .filter((entry: [string, unknown]) => entry[1] !== undefined)
      .sort((left, right) => (left[0] < right[0] ? -1 : left[0] > right[0] ? 1 : 0));
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableJson(item)}`).join(',')}}`;
  }
  return value === undefined ? 'null' : JSON.stringify(value);
}

export function ordinalsOf(nodes: readonly FlowNode[]): ReadonlyMap<string, number> {
  const ordinals = new Map<string, number>();
  const visit = (list: readonly FlowNode[]): void => {
    for (const node of list) {
      ordinals.set(node.key, ordinals.size);
      for (const child of childScopeRefs(node, [])) visit(child.scope.nodes);
    }
  };
  visit(nodes);
  return ordinals;
}

export function freshFrame(
  pattern: ReadonlyMap<string, number>,
  candidate: ReadonlyMap<string, number>,
): Frame {
  return {
    ordinals: { pattern, candidate },
    alpha: { pattern: new Map(), candidate: new Map() },
    bindings: new Map(),
  };
}

function slot(table: Map<string, number>, key: string): number {
  const known = table.get(key);
  if (known !== undefined) return known;
  table.set(key, table.size);
  return table.size - 1;
}

function canonicalWire(wire: Wire, side: Side, frame: Frame, scratch: boolean): string {
  const ordinal = frame.ordinals[side].get(wire.from);
  if (ordinal !== undefined) return `__n${String(ordinal)}.${wire.port}`;
  const plain = `${wire.from}.${wire.port}`;
  if (KEPT_ROOTS.has(wire.from) || scratch) return plain;
  if (side === 'candidate') return `__in${String(slot(frame.alpha.candidate, plain))}`;
  return wire.from === 'inputs' ? `__in${String(slot(frame.alpha.pattern, wire.port))}` : plain;
}

export function canonical(value: PortValue, side: Side, frame: Frame, scratch = false): string {
  if ('lit' in value) return `L${stableJson(value.lit)}`;
  return `W${canonicalWire(value.wire, side, frame, scratch)}`;
}

export function wildcardOf(value: PortValue): string | undefined {
  return 'wire' in value && value.wire.from === 'inputs' ? value.wire.port : undefined;
}
