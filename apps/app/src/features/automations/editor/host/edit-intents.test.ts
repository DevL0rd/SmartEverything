import {
  EMPTY_LAYOUT,
  NODE_REGISTRY,
  type GraphNode,
  type Layout,
  type ProgramV4,
  STATIC_KIND_LOOKUP,
} from '@smarteverything/domain';
import type { CheckContext } from '@smarteverything/flow/check/shapes';
import { layoutGraph } from '@smarteverything/flow/graph/layout';
import { describe, expect, it } from 'vitest';
import {
  automation,
  decisionProgram,
  forkProgram,
  idOf,
  loopProgram,
  note,
  reading,
  start,
  wire,
} from '../../model/graph/graph-scene-fixtures';
import { babyProgram } from '../../model/graph/graph-baby-fixture';
import { planConnect, type EdgeEndRequest } from './connect-intent';
import { planDelete } from './delete-intent';
import { planDisconnect } from './disconnect-intent';
import { planInsert } from './insert-intent';
import {
  evaluate,
  type GraphDocument,
  type IntentOutcome,
  type IntentRuntime,
  type IntentSuccess,
  type Planned,
} from './intent-env';
import { planWrap } from './wrap-intent';

function planWithStaticKinds(
  doc: Parameters<typeof planConnect>[0],
  request: Parameters<typeof planConnect>[1],
): ReturnType<typeof planConnect> {
  return planConnect(doc, request, STATIC_KIND_LOOKUP);
}

const check: CheckContext = {
  kinds: (id) => NODE_REGISTRY.get(id),
  automations: () => undefined,
  scopeOutputs: () => [],
  references: () => false,
  functions: () => undefined,
  secrets: new Set(),
};

function runtime(): IntentRuntime {
  let count = 0;
  return {
    newId: (): string => {
      count += 1;
      return `00000000-0000-4000-9000-${String(count).padStart(12, '0')}`;
    },
    density: 'touch',
    direction: 'ltr',
    check,
    kinds: NODE_REGISTRY,
    sizes: new Map(),
  };
}

function documentOf(program: ProgramV4): GraphDocument {
  const laid = layoutGraph(program, {
    kinds: STATIC_KIND_LOOKUP,
    direction: 'ltr',
    density: 'touch',
  });
  const layout: Layout = { ...EMPTY_LAYOUT, nodes: { ...laid.nodes } };
  return { program, layout };
}

function chain(): GraphDocument {
  return documentOf(automation([start('a'), note('a', 'b'), note('b', 'c'), note('c')]));
}

function ok(outcome: IntentOutcome): IntentSuccess {
  if (!outcome.ok) throw new Error(`refused: ${outcome.reason}`);
  return outcome;
}

function refusal(doc: GraphDocument, planned: Planned): string {
  const outcome = evaluate(doc, planned, runtime());
  if (outcome.ok) throw new Error('expected a refusal');
  expect(outcome.toast).toBe(outcome.reason);
  expect(outcome.announcement).toBe(outcome.reason);
  return outcome.reason;
}

function nodeOf(outcome: IntentSuccess, key: string): GraphNode | undefined {
  return outcome.program.nodes.find((node) => node.key === key);
}

function covered(outcome: IntentSuccess): boolean {
  return outcome.program.nodes.every((node) => outcome.layout.nodes[node.id] !== undefined);
}

describe('planInsert', () => {
  const after = (key: string): { nodeId: string; port: string } => ({
    nodeId: idOf(key),
    port: 'next',
  });

  it('splices a step into the wire and keeps the old target on Then', () => {
    const rt = runtime();
    const doc = chain();
    const out = ok(
      evaluate(doc, planInsert(doc, { kind: 'flow.wait', after: after('a') }, rt), rt),
    );
    const added = out.program.nodes.find((node) => node.kind === 'flow.wait');
    expect(nodeOf(out, 'a')?.to).toEqual({ next: added?.key });
    expect(added?.to).toEqual({ next: 'b' });
    expect(out.announcement).toBe('Added Wait after Activity feed note.');
    expect(out.selection).toEqual([added?.id]);
  });

  it('completes the layout for the new node and honours a drop point', () => {
    const rt = runtime();
    const doc = chain();
    const spliced = ok(
      evaluate(doc, planInsert(doc, { kind: 'flow.wait', after: after('a') }, rt), rt),
    );
    expect(covered(spliced)).toBe(true);
    const point = { x: 900, y: 700 };
    const dropped = ok(evaluate(doc, planInsert(doc, { kind: 'flow.wait', point }, rt), rt));
    const wait = dropped.program.nodes.find((node) => node.kind === 'flow.wait');
    expect(dropped.layout.nodes[wait?.id ?? '']).toEqual(point);
  });

  it('appends at an end cap', () => {
    const rt = runtime();
    const doc = documentOf(automation([start('a'), note('a')]));
    const out = ok(
      evaluate(doc, planInsert(doc, { kind: 'flow.wait', after: after('a') }, rt), rt),
    );
    const added = out.program.nodes.find((node) => node.kind === 'flow.wait');
    expect(nodeOf(out, 'a')?.to).toEqual({ next: added?.key });
    expect(added?.to).toBeUndefined();
  });

  it('inserts Do together as a pair with the old target after the join', () => {
    const rt = runtime();
    const doc = chain();
    const out = ok(
      evaluate(doc, planInsert(doc, { kind: 'flow.parallel', after: after('a') }, rt), rt),
    );
    const fork = out.program.nodes.find((node) => node.kind === 'flow.parallel');
    const join = out.program.nodes.find((node) => node.kind === 'flow.join');
    expect(fork?.paths?.map((path) => path.to)).toEqual([join?.key, join?.key]);
    expect(join?.to).toEqual({ next: 'b' });
    expect(out.announcement).toContain('with its Wait for all');
    expect(covered(out)).toBe(true);
  });

  it('gives a decision the old target on its first branch', () => {
    const rt = runtime();
    const doc = chain();
    const out = ok(evaluate(doc, planInsert(doc, { kind: 'flow.if', after: after('a') }, rt), rt));
    const decision = out.program.nodes.find((node) => node.kind === 'flow.if');
    expect(decision?.branches?.[0]?.to).toBe('b');
    expect(decision?.to).toBeUndefined();
  });

  it('refuses what cannot be inserted', () => {
    const rt = runtime();
    const doc = chain();
    expect(refusal(doc, planInsert(doc, { kind: 'nope.nothing' }, rt))).toContain('nope.nothing');
    const gone = { nodeId: idOf('missing'), port: 'next' };
    expect(refusal(doc, planInsert(doc, { kind: 'flow.wait', after: gone }, rt))).toBe(
      'That step is no longer on the canvas.',
    );
    const odd = { nodeId: idOf('a'), port: 'sideways' };
    expect(refusal(doc, planInsert(doc, { kind: 'flow.wait', after: odd }, rt))).toContain(
      'sideways',
    );
    expect(
      refusal(doc, planInsert(doc, { kind: 'trigger.interval', after: after('a') }, rt)),
    ).toContain('trigger');
  });
});

describe('planConnect', () => {
  const end = (key: string, handle: string): EdgeEndRequest => ({ nodeId: idOf(key), handle });

  it('connects an exit to a card', () => {
    const doc = documentOf(automation([start('a'), note('a'), note('b')]));
    const out = ok(
      evaluate(
        doc,
        planWithStaticKinds(doc, { from: end('a', 'x:next'), to: end('b', 'x:in') }),
        runtime(),
      ),
    );
    expect(nodeOf(out, 'a')?.to).toEqual({ next: 'b' });
    expect(out.toast).toBeUndefined();
    expect(out.announcement).toBe('Then of Activity feed note now goes to Activity feed note.');
  });

  it('replaces a wire and says so in the toast', () => {
    const doc = chain();
    const out = ok(
      evaluate(
        doc,
        planWithStaticKinds(doc, { from: end('a', 'x:next'), to: end('c', 'x:in') }),
        runtime(),
      ),
    );
    expect(nodeOf(out, 'a')?.to).toEqual({ next: 'c' });
    expect(out.toast).toBe('Replaced: Then now goes to Activity feed note.');
  });

  it('refuses a circle, Start, a loop border and fork paths with the checker text', () => {
    const doc = chain();
    expect(
      refusal(doc, planWithStaticKinds(doc, { from: end('c', 'x:next'), to: end('a', 'x:in') })),
    ).toBe('This would make a circle. Use a loop to repeat.');
    expect(
      refusal(
        doc,
        planWithStaticKinds(doc, { from: end('c', 'x:next'), to: end('start', 'x:in') }),
      ),
    ).toBe('Nothing can lead into Start.');
    const looped = documentOf(loopProgram());
    expect(
      refusal(
        looped,
        planWithStaticKinds(looped, { from: end('show', 'x:next'), to: end('done', 'x:in') }),
      ),
    ).toContain('cannot lead outside it');
    const forked = documentOf(forkProgram('all'));
    expect(
      refusal(
        forked,
        planWithStaticKinds(forked, { from: end('l', 'x:next'), to: end('r', 'x:in') }),
      ),
    ).toBe('Steps in different paths of a Do together cannot lead to each other.');
    expect(
      refusal(doc, planWithStaticKinds(doc, { from: end('a', 'x:in'), to: end('b', 'x:in') })),
    ).toBe('Drag from an output pin.');
  });

  it('wires a value into a port, a condition and the admit rule', () => {
    const doc = documentOf(decisionProgram());
    const into = planWithStaticKinds(doc, {
      from: end('sensor', 'o:value'),
      to: end('after', 'v:message'),
    });
    expect(nodeOf(ok(evaluate(doc, into, runtime())), 'after')?.ports?.['message']).toEqual(
      wire('sensor', 'value'),
    );
    const row = `v:row:${idOf('check:dark')}:when`;
    const cond = planWithStaticKinds(doc, {
      from: end('sensor', 'o:other'),
      to: end('check', row),
    });
    expect(nodeOf(ok(evaluate(doc, cond, runtime())), 'check')?.branches?.[0]?.when).toEqual(
      wire('sensor', 'other'),
    );
    const admit = planWithStaticKinds(doc, {
      from: end('sensor', 'o:value'),
      to: end('start', 'v:admit'),
    });
    const admitted = ok(evaluate(doc, admit, runtime())).program;
    expect(admitted.kind === 'automation' ? admitted.admit : undefined).toEqual(
      wire('sensor', 'value'),
    );
    const self = planWithStaticKinds(doc, {
      from: end('sensor', 'o:value'),
      to: end('sensor', 'v:device'),
    });
    expect(refusal(doc, self)).toBe('A value cannot feed the step that makes it.');
  });
});

describe('planDisconnect', () => {
  const end = (key: string, handle: string): EdgeEndRequest => ({ nodeId: idOf(key), handle });

  it('removes an exec wire and a value wire', () => {
    const doc = chain();
    const exec = planDisconnect(
      doc,
      { kind: 'exec', from: end('a', 'x:next') },
      STATIC_KIND_LOOKUP,
    );
    expect(nodeOf(ok(evaluate(doc, exec, runtime())), 'a')?.to).toBeUndefined();
    const valued = documentOf(
      automation([
        start('a'),
        reading('sensor'),
        note('a', undefined, { ports: { message: wire('sensor', 'value') } }),
      ]),
    );
    const value = planDisconnect(
      valued,
      { kind: 'value', target: end('a', 'v:message') },
      STATIC_KIND_LOOKUP,
    );
    expect(nodeOf(ok(evaluate(valued, value, runtime())), 'a')?.ports).toBeUndefined();
  });

  it('refuses a missing wire and a condition', () => {
    const doc = chain();
    expect(
      refusal(
        doc,
        planDisconnect(doc, { kind: 'exec', from: end('c', 'x:next') }, STATIC_KIND_LOOKUP),
      ),
    ).toBe('There is no wire there.');
    const decision = documentOf(decisionProgram());
    const row = `v:row:${idOf('check:dark')}:when`;
    expect(
      refusal(
        decision,
        planDisconnect(decision, { kind: 'value', target: end('check', row) }, STATIC_KIND_LOOKUP),
      ),
    ).toContain('always holds a value');
  });
});

describe('planDelete', () => {
  it('heals the wire around a deleted step', () => {
    const doc = chain();
    const out = ok(
      evaluate(doc, planDelete(doc, { ids: [idOf('b')] }, STATIC_KIND_LOOKUP), runtime()),
    );
    expect(nodeOf(out, 'a')?.to).toEqual({ next: 'c' });
    expect(nodeOf(out, 'b')).toBeUndefined();
    expect(out.announcement).toBe(
      'Deleted Activity feed note; Activity feed note now goes to Activity feed note.',
    );
    expect(out.selection).toEqual([]);
  });

  it('deletes Set Nursery lamp in Baby crying and points the Night row to the next step', () => {
    const doc = documentOf(babyProgram());
    const out = ok(
      evaluate(doc, planDelete(doc, { ids: [idOf('lamp')] }, STATIC_KIND_LOOKUP), runtime()),
    );
    const night = nodeOf(out, 'night');
    expect(nodeOf(out, 'lamp')).toBeUndefined();
    expect(night?.to).toEqual({ else: 'parents' });
    expect(night?.branches?.map((row) => [row.name, row.to])).toEqual([['Night', 'both']]);
  });

  it('leaves a deleted decision branches as unconnected steps', () => {
    const doc = documentOf(decisionProgram());
    const out = ok(
      evaluate(doc, planDelete(doc, { ids: [idOf('check')] }, STATIC_KIND_LOOKUP), runtime()),
    );
    expect(nodeOf(out, 'start')?.to).toBeUndefined();
    expect(nodeOf(out, 'lamp')).toBeDefined();
    expect(out.announcement).toContain('unconnected');
  });

  it('deletes a step with everything it owns and reconnects what came before', () => {
    const doc = documentOf(loopProgram());
    const out = ok(
      evaluate(
        doc,
        planDelete(doc, { ids: [idOf('each')], mode: 'owned' }, STATIC_KIND_LOOKUP),
        runtime(),
      ),
    );
    expect(nodeOf(out, 'show')).toBeUndefined();
    expect(nodeOf(out, 'each')).toBeUndefined();
    expect(nodeOf(out, 'start')?.to).toEqual({ next: 'done' });
    expect(out.announcement).toBe('Deleted For each and 1 step it owned.');
  });

  it('keeps Start and removes a value node together with its wires', () => {
    const valued = documentOf(
      automation([
        start('a'),
        reading('sensor'),
        note('a', undefined, { ports: { message: wire('sensor', 'value') } }),
      ]),
    );
    const out = ok(
      evaluate(
        valued,
        planDelete(valued, { ids: [idOf('start'), idOf('sensor')] }, STATIC_KIND_LOOKUP),
        runtime(),
      ),
    );
    expect(nodeOf(out, 'start')).toBeDefined();
    expect(nodeOf(out, 'a')?.ports).toEqual({});
    expect(out.announcement).toContain('Start stays.');
    expect(
      refusal(valued, planDelete(valued, { ids: [idOf('start')] }, STATIC_KIND_LOOKUP)),
    ).toContain('Start');
  });
});

describe('planWrap', () => {
  it('wraps a chain in If with the old exit on Otherwise', () => {
    const doc = chain();
    const rt = runtime();
    const out = ok(
      evaluate(doc, planWrap(doc, { ids: [idOf('b'), idOf('a')], wrapper: 'if' }, rt), rt),
    );
    const container = out.program.nodes.find((node) => node.kind === 'flow.if');
    expect(container?.branches?.[0]?.to).toBe('a');
    expect(container?.to).toEqual({ else: 'c' });
    expect(nodeOf(out, 'start')?.to).toEqual({ next: container?.key });
    expect(out.selection).toEqual([container?.id]);
    expect(out.announcement).toBe('Wrapped 2 steps in If.');
    expect(covered(out)).toBe(true);
  });

  it('wraps in Do together with its Wait for all', () => {
    const doc = chain();
    const rt = runtime();
    const out = ok(evaluate(doc, planWrap(doc, { ids: [idOf('a')], wrapper: 'together' }, rt), rt));
    expect(out.program.nodes.some((node) => node.kind === 'flow.join')).toBe(true);
    expect(out.announcement).toBe('Wrapped 1 step in Do together with its Wait for all.');
    expect(covered(out)).toBe(true);
  });

  it('refuses values and chains with two ways in', () => {
    const valued = documentOf(automation([start('a'), reading('sensor'), note('a')]));
    const rt = runtime();
    expect(refusal(valued, planWrap(valued, { ids: [idOf('sensor')], wrapper: 'try' }, rt))).toBe(
      'Only steps can be wrapped.',
    );
    const doc = chain();
    expect(
      refusal(doc, planWrap(doc, { ids: [idOf('a'), idOf('c')], wrapper: 'loop' }, rt)),
    ).toContain('one way in');
  });
});
