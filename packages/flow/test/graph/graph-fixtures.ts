import type { FlowNode, GraphNode, PortValue, ProgramV4, Scope } from '@smarteverything/domain';

const ids = new Map<string, string>();

export function idOf(name: string): string {
  const known = ids.get(name);
  if (known !== undefined) return known;
  const made = `00000000-0000-4000-8000-${String(ids.size + 1).padStart(12, '0')}`;
  ids.set(name, made);
  return made;
}

export const TRUE: PortValue = { lit: true };

export function graphNode(key: string, kind: string, extra: Partial<GraphNode> = {}): GraphNode {
  return { id: idOf(key), key, kind, ...extra };
}

function wired(next: string | undefined): Partial<GraphNode> {
  return next === undefined ? {} : { to: { next } };
}

export function start(next?: string): GraphNode {
  return graphNode('start', 'flow.start', wired(next));
}

export function onFailure(next?: string): GraphNode {
  return graphNode('onFailure', 'flow.on_failure', wired(next));
}

export function step(key: string, next?: string, extra: Partial<GraphNode> = {}): GraphNode {
  return graphNode(key, 'device.set', { ...wired(next), ...extra });
}

export function value(key: string): GraphNode {
  return graphNode(key, 'device.get');
}

export function stop(key: string): GraphNode {
  return graphNode(key, 'flow.stop');
}

export function giveBack(key: string): GraphNode {
  return graphNode(key, 'flow.return');
}

export function join(key: string, next?: string): GraphNode {
  return graphNode(key, 'flow.join', wired(next));
}

export interface RowSpec {
  readonly name: string;
  readonly to?: string;
}

function rowTo(row: RowSpec): { to?: string } {
  return row.to === undefined ? {} : { to: row.to };
}

export function ifNode(key: string, rows: readonly RowSpec[], otherwise?: string): GraphNode {
  return graphNode(key, 'flow.if', {
    branches: rows.map((row) => ({ id: idOf(`${key}:${row.name}`), when: TRUE, ...rowTo(row) })),
    ...(otherwise === undefined ? {} : { to: { else: otherwise } }),
  });
}

export function switchNode(key: string, rows: readonly RowSpec[], otherwise?: string): GraphNode {
  return graphNode(key, 'flow.switch', {
    cases: rows.map((row) => ({
      id: idOf(`${key}:${row.name}`),
      match: { eq: row.name },
      ...rowTo(row),
    })),
    ...(otherwise === undefined ? {} : { to: { default: otherwise } }),
  });
}

export function loop(key: string, kind: string, body?: string, next?: string): GraphNode {
  return graphNode(key, kind, {
    to: { ...(body === undefined ? {} : { body }), ...(next === undefined ? {} : { next }) },
  });
}

export interface TrySpec {
  readonly attempt?: string;
  readonly catches: readonly RowSpec[];
  readonly finally?: string;
  readonly next?: string;
}

export function tryNode(key: string, spec: TrySpec): GraphNode {
  return graphNode(key, 'flow.try', {
    catches: spec.catches.map((row) => ({ id: idOf(`${key}:${row.name}`), ...rowTo(row) })),
    to: {
      ...(spec.attempt === undefined ? {} : { try: spec.attempt }),
      ...(spec.finally === undefined ? {} : { finally: spec.finally }),
      ...(spec.next === undefined ? {} : { next: spec.next }),
    },
  });
}

export function together(key: string, paths: readonly RowSpec[]): GraphNode {
  return graphNode(key, 'flow.parallel', {
    paths: paths.map((path) => ({ name: path.name, ...rowTo(path) })),
  });
}

export function automation(nodes: readonly GraphNode[]): ProgramV4 {
  return {
    version: 4,
    kind: 'automation',
    triggers: [],
    inputs: [],
    outputs: [],
    variables: [],
    nodes: [...nodes],
    policy: { mode: 'single' },
  };
}

export function flow(key: string, kind: string, extra: Partial<FlowNode> = {}): FlowNode {
  return { id: idOf(key), key, kind, ...extra };
}

export function plain(key: string, extra: Partial<FlowNode> = {}): FlowNode {
  return flow(key, 'device.set', extra);
}

export function scope(...nodes: FlowNode[]): Scope {
  return { nodes };
}
