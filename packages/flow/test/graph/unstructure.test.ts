import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { createHash } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { AutomationV3, FlowNode, GraphNode, ProgramV4, Scope } from '@smarteverything/domain';
import { PROGRAM_V4 } from '@smarteverything/domain';
import { graphKey, graphNodeId } from '../../src/graph/graph-ids';
import { structuredOf } from '../../src/graph/structured-of';
import { UnstructureRefusal, unstructure } from '../../src/graph/unstructure';
import { automation as treeOf } from '../check/c23-support';
import { TRUE, flow, idOf, plain, scope } from './graph-fixtures';
import { PLUGIN_BRANCHING, PLUGIN_LOOKUP, PLUGIN_STEP } from './plugin-lookup';

const row = (
  name: string,
  ...nodes: FlowNode[]
): { id: string; when: typeof TRUE; scope: Scope } => ({
  id: idOf(`row:${name}`),
  when: TRUE,
  scope: scope(...nodes),
});

const decide = (key: string, rows: ReturnType<typeof row>[], otherwise?: Scope): FlowNode =>
  flow(key, 'flow.if', {
    branches: rows,
    ...(otherwise === undefined ? {} : { scopes: { else: otherwise } }),
  });

const loopOf = (key: string, ...body: FlowNode[]): FlowNode =>
  flow(key, 'flow.repeat', { scopes: { body: scope(...body) } });

const together = (key: string, paths: Record<string, Scope>): FlowNode =>
  flow(key, 'flow.parallel', { scopes: paths });

const guard = (key: string): FlowNode =>
  flow(key, 'flow.guard', { ports: { condition: TRUE, quietly: { lit: true } } });

function graphOf(body: FlowNode[], extra: Partial<AutomationV3> = {}): ProgramV4 {
  return unstructure(treeOf(body, extra), STATIC_KIND_LOOKUP);
}

function nodeOf(graph: ProgramV4, key: string): GraphNode {
  const found = graph.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`the graph has no node ${key}`);
  return found;
}

const wiresOf = (graph: ProgramV4, key: string): Record<string, string> | undefined =>
  nodeOf(graph, key).to;

describe('rule 1: Start and On failure', () => {
  it('wires Start to the first exec node of the body, skipping value nodes', () => {
    const graph = graphOf([flow('v', 'device.get'), plain('a'), plain('b')]);
    expect(nodeOf(graph, 'start')).toMatchObject({ kind: 'flow.start', to: { next: 'a' } });
    expect(graph.nodes.map((node) => node.key).slice(0, 2)).toEqual(['start', 'v']);
  });

  it('adds On failure only when the program has a failure scope', () => {
    expect(graphOf([plain('a')]).nodes.some((node) => node.kind === 'flow.on_failure')).toBe(false);
    const graph = graphOf([plain('a')], { onFailure: scope(plain('cleanup')) });
    expect(nodeOf(graph, 'failure')).toMatchObject({
      kind: 'flow.on_failure',
      to: { next: 'cleanup' },
    });
    expect(wiresOf(graph, 'cleanup')).toBeUndefined();
  });

  it('gives an empty body a Start with no wire', () => {
    expect(wiresOf(graphOf([]), 'start')).toBeUndefined();
  });
});

describe('rule 2: chaining', () => {
  it('chains exec nodes in order and gives value nodes no exec wire', () => {
    const graph = graphOf([plain('a'), flow('v', 'device.get'), plain('b'), plain('c')]);
    expect(wiresOf(graph, 'a')).toEqual({ next: 'b' });
    expect(wiresOf(graph, 'b')).toEqual({ next: 'c' });
    expect(wiresOf(graph, 'c')).toBeUndefined();
    expect(wiresOf(graph, 'v')).toBeUndefined();
  });
});

describe('rule 3: continuation', () => {
  it('sends the last node of a decision branch to the node after the decision', () => {
    const graph = graphOf([decide('d', [row('x', plain('a'), plain('b'))]), plain('c')]);
    expect(wiresOf(graph, 'a')).toEqual({ next: 'b' });
    expect(wiresOf(graph, 'b')).toEqual({ next: 'c' });
  });

  it('carries the continuation through nested decisions', () => {
    const inner = decide('inner', [row('y', plain('x'))]);
    const graph = graphOf([decide('outer', [row('o', inner)]), plain('tail')]);
    expect(wiresOf(graph, 'x')).toEqual({ next: 'tail' });
  });

  it('leaves the last node of the body and of any other lane unwired', () => {
    const graph = graphOf([loopOf('l', plain('inside')), plain('last')]);
    expect(wiresOf(graph, 'inside')).toBeUndefined();
    expect(wiresOf(graph, 'last')).toBeUndefined();
  });

  it('does not carry a decision continuation into a loop body', () => {
    const graph = graphOf([decide('d', [row('x', loopOf('l', plain('inside')))]), plain('after')]);
    expect(wiresOf(graph, 'inside')).toBeUndefined();
    expect(wiresOf(graph, 'l')).toEqual({ body: 'inside', next: 'after' });
  });
});

describe('rule 4: decision rows', () => {
  it('points an empty row, a missing Otherwise and an empty Otherwise at the continuation', () => {
    const empty = graphOf([decide('d', [row('x')]), plain('c')]);
    expect(nodeOf(empty, 'd')).toMatchObject({
      branches: [{ to: 'c' }],
      to: { else: 'c' },
    });
    const bare = graphOf([decide('d', [row('x', plain('a'))], scope()), plain('c')]);
    expect(wiresOf(bare, 'd')).toEqual({ else: 'c' });
  });

  it('wires nothing when the decision ends the scope and the branch is empty', () => {
    const graph = graphOf([decide('d', [row('x')])]);
    expect(nodeOf(graph, 'd').branches).toEqual([{ id: idOf('row:x'), when: TRUE }]);
    expect(wiresOf(graph, 'd')).toBeUndefined();
  });

  it('wires the cases and the Default of a Switch the same way', () => {
    const cases = [{ id: idOf('case:1'), match: { eq: 1 }, scope: scope(plain('one')) }];
    const graph = graphOf([flow('s', 'flow.switch', { cases }), plain('after')]);
    expect(nodeOf(graph, 's')).toMatchObject({ cases: [{ to: 'one' }], to: { default: 'after' } });
    expect(wiresOf(graph, 'one')).toEqual({ next: 'after' });
  });
});

describe('rule 5: guard', () => {
  it('leaves Otherwise unwired at the top level', () => {
    const graph = graphOf([guard('g'), plain('a')]);
    expect(wiresOf(graph, 'g')).toEqual({ next: 'a' });
  });

  it('sends Otherwise to the node after the decision inside a row', () => {
    const graph = graphOf([decide('d', [row('x', guard('g'), plain('a'))]), plain('after')]);
    expect(wiresOf(graph, 'g')).toEqual({ next: 'a', otherwise: 'after' });
  });

  it('sends Otherwise to the path Wait for all inside a Do together', () => {
    const graph = graphOf([together('t', { one: scope(guard('g'), plain('a')), two: scope() })]);
    expect(wiresOf(graph, 'g')).toEqual({ next: 'a', otherwise: 't_join' });
  });
});

describe('rule 6: memory node exits', () => {
  const cooldown = (scopes?: Record<string, Scope>): FlowNode =>
    flow('cool', 'timing.cooldown', { ...(scopes === undefined ? {} : { scopes }) });

  it('wires an exit without a lane to the scope continuation', () => {
    const graph = graphOf([decide('d', [row('x', cooldown(), plain('a'))]), plain('after')]);
    expect(wiresOf(graph, 'cool')).toEqual({ next: 'a', blocked: 'after' });
  });

  it('wires an exit with a lane into the lane and the lane on to the Then target', () => {
    const lane = { blocked: scope(plain('note')) };
    const graph = graphOf([cooldown(lane), plain('after')]);
    expect(wiresOf(graph, 'cool')).toEqual({ next: 'after', blocked: 'note' });
    expect(wiresOf(graph, 'note')).toEqual({ next: 'after' });
  });
});

describe('rule 7: Do together', () => {
  const graph = graphOf([
    together('t', { one: scope(plain('a'), plain('b')), two: scope() }),
    plain('after'),
  ]);

  it('creates a Wait for all that every path ends in and that continues to the next node', () => {
    expect(nodeOf(graph, 't')).toMatchObject({
      paths: [
        { name: 'one', to: 'a' },
        { name: 'two', to: 't_join' },
      ],
    });
    expect(wiresOf(graph, 'b')).toEqual({ next: 't_join' });
    expect(nodeOf(graph, 't_join')).toMatchObject({ kind: 'flow.join', to: { next: 'after' } });
  });

  it('continues the Wait for all with the continuation of a Do together inside a row', () => {
    const nested = graphOf([
      decide('d', [row('x', together('t', { one: scope(plain('a')), two: scope(plain('b')) }))]),
      plain('after'),
    ]);
    expect(wiresOf(nested, 't_join')).toEqual({ next: 'after' });
  });

  it('gives the Wait for all a fresh key when the name is taken', () => {
    const taken = graphOf([
      plain('t_join'),
      together('t', { one: scope(plain('a')), two: scope(plain('b')) }),
    ]);
    expect(nodeOf(taken, 't_join_2').kind).toBe('flow.join');
    expect(graphKey('t_join', new Set(['t_join', 't_join_2']))).toBe('t_join_3');
  });
});

describe('rule 8: lanes', () => {
  it('points the lane ports at the first node of their scope and wires nothing after it', () => {
    const catches = [
      { id: idOf('catch:1'), scope: scope(plain('caught1'), plain('caught2')) },
      { id: idOf('catch:2'), scope: scope() },
    ];
    const tryNode = flow('guarded', 'flow.try', {
      scopes: { try: scope(plain('t1'), plain('t2')), finally: scope(plain('fin')) },
      catches,
    });
    const graph = graphOf([tryNode, plain('after')]);
    expect(nodeOf(graph, 'guarded')).toMatchObject({
      to: { try: 't1', finally: 'fin', next: 'after' },
      catches: [{ to: 'caught1' }, { id: idOf('catch:2') }],
    });
    expect(wiresOf(graph, 't2')).toBeUndefined();
    expect(wiresOf(graph, 'caught2')).toBeUndefined();
    expect(nodeOf(graph, 'guarded').catches?.[1]).not.toHaveProperty('to');
  });

  it('points the error lane of a routed step at its first node', () => {
    const routed = plain('risky', { scopes: { onError: scope(plain('handler')) } });
    const graph = graphOf([routed, plain('after')]);
    expect(wiresOf(graph, 'risky')).toEqual({ next: 'after', onError: 'handler' });
    expect(wiresOf(graph, 'handler')).toBeUndefined();
  });
});

describe('rule 9: flow.sequence', () => {
  it('is refused with a named error before any registry lookup', () => {
    const body = [
      flow('mystery', 'no.such_kind'),
      flow('seq', 'flow.sequence', { scopes: { body: scope(plain('a')) } }),
    ];
    const attempt = (): ProgramV4 => graphOf(body);
    expect(attempt).toThrow(UnstructureRefusal);
    expect(attempt).toThrow(/flow\.sequence/);
    try {
      attempt();
    } catch (error) {
      expect(error).toMatchObject({
        name: 'UnstructureRefusal',
        code: 'flow_sequence',
        key: 'seq',
        nodeId: idOf('seq'),
      });
    }
  });
});

describe('the new nodes', () => {
  const body = [plain('a'), together('t', { one: scope(plain('b')), two: scope(plain('c')) })];
  const owned = (owner: string, role: string): string => {
    const bytes = createHash('sha256').update(`automation-graph:${owner}:${role}`).digest();
    const head = Buffer.from(bytes.subarray(0, 16));
    head[6] = ((head[6] ?? 0) & 0x0f) | 0x80;
    head[8] = ((head[8] ?? 0) & 0x3f) | 0x80;
    const hex = head.toString('hex');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  };

  it('get ids from the first 16 bytes of sha256 as a version 8 uuid', () => {
    const graph = graphOf(body, { onFailure: scope(plain('f')) });
    expect(nodeOf(graph, 'start').id).toBe(owned(idOf('a'), 'start'));
    expect(nodeOf(graph, 'failure').id).toBe(owned(idOf('f'), 'failure'));
    expect(nodeOf(graph, 't_join').id).toBe(owned(idOf('t'), 'join'));
    expect(graphNodeId(idOf('t'), 'join')).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
  });

  it('are the same on every run and the graph is valid', () => {
    const first = graphOf(body);
    expect(graphOf(body)).toEqual(first);
    expect(PROGRAM_V4.safeParse(first).success).toBe(true);
  });

  it('leave the ids, keys and settings of the existing nodes alone', () => {
    const settings = plain('a', { label: 'First', ports: { to: { lit: 1 } }, enabled: false });
    const graph = graphOf([settings, plain('b')]);
    expect(nodeOf(graph, 'a')).toMatchObject({
      id: settings.id,
      kind: 'device.set',
      label: 'First',
      enabled: false,
      ports: { to: { lit: 1 } },
    });
  });

  it('take the next free key when Start is already a key', () => {
    const graph = graphOf([plain('start'), plain('b')]);
    expect(nodeOf(graph, 'start_2').kind).toBe('flow.start');
    expect(nodeOf(graph, 'start').kind).toBe('device.set');
  });
});

describe('converting back', () => {
  it('structures a converted program to the tree it came from', () => {
    const tree = treeOf([decide('d', [row('x', plain('a'))], scope(plain('b'))), plain('c')]);
    const structured = structuredOf(unstructure(tree, STATIC_KIND_LOOKUP), STATIC_KIND_LOOKUP);
    if (structured.kind !== 'structured') throw new Error('expected a tree');
    expect(structured.tree.body).toEqual(tree.body);
  });
});

describe('a lookup that knows plugin kinds', () => {
  const followed = (): FlowNode[] => [plain('a'), flow('p', PLUGIN_STEP), plain('b')];

  it('chains a plugin step like any step', () => {
    const graph = unstructure(treeOf(followed()), PLUGIN_LOOKUP);
    expect(wiresOf(graph, 'start')).toEqual({ next: 'a' });
    expect(wiresOf(graph, 'a')).toEqual({ next: 'p' });
    expect(wiresOf(graph, 'p')).toEqual({ next: 'b' });
  });

  it('keeps the old result without the lookup, where the unknown kind is only a value', () => {
    const graph = unstructure(treeOf(followed()), STATIC_KIND_LOOKUP);
    expect(wiresOf(graph, 'a')).toEqual({ next: 'b' });
    expect(wiresOf(graph, 'p')).toBeUndefined();
  });

  it('wires the extra exit lanes of a plugin step from its declared exits', () => {
    const watch = flow('w', PLUGIN_BRANCHING, { scopes: { changed: scope(plain('c')) } });
    const graph = unstructure(treeOf([watch, plain('b')]), PLUGIN_LOOKUP);
    expect(wiresOf(graph, 'w')).toEqual({ next: 'b', changed: 'c' });
  });
});
