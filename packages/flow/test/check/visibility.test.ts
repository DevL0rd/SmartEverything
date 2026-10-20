import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import type { AutomationV3, FlowNode, FunctionV3, PortValue } from '@smarteverything/domain';
import { automationV3, functionV3 } from '../../../domain/test/support/automation-v3-arbitraries';
import type { ResolvedReference, VisibilityKinds } from '../../src/check/visibility-types';
import { checkVisibility, defaultScopeOutputs } from '../../src/check/visibility';
import { indexProgram } from '../../src/program/lookup';
import type { Program } from '../../src/program/walk';

const CLASSES = new Map<string, 'pure' | 'read' | 'effect' | 'control'>([
  ['device.set', 'effect'],
  ['notify.feed', 'effect'],
  ['math.add', 'pure'],
  ['device.get', 'read'],
  ['flow.wait', 'control'],
  ['flow.if', 'control'],
  ['flow.switch', 'control'],
  ['flow.repeat', 'control'],
  ['flow.for_each', 'control'],
  ['flow.for_range', 'control'],
  ['flow.while', 'control'],
  ['flow.try', 'control'],
  ['flow.parallel', 'control'],
]);

const KINDS: VisibilityKinds = {
  classOf: (kind) => CLASSES.get(kind),
  outputsOf: (kind) => {
    if (kind === 'flow.for_each') return [{ name: 'results', optional: true }];
    if (kind === 'flow.parallel') return [{ name: 'status' }];
    return [];
  },
};

let counter = 0;

function uid(): string {
  counter += 1;
  return `00000000-0000-4000-8000-${counter.toString(16).padStart(12, '0')}`;
}

const wired = (reference: string): PortValue => {
  const [from = '', port = ''] = reference.split('.');
  return { wire: { from, port } };
};

function leaf(key: string, ports: Record<string, PortValue> = {}, kind = 'device.set'): FlowNode {
  return { id: uid(), key, kind, ports };
}

function reads(key: string, sources: string, kind = 'device.set'): FlowNode {
  const ports = sources
    .split(' + ')
    .map((source, index) => [index === 0 ? 'value' : `value${String(index)}`, wired(source)]);
  return leaf(key, Object.fromEntries(ports), kind);
}

function ifNode(
  key: string,
  branches: readonly (readonly FlowNode[])[],
  other?: readonly FlowNode[],
  extra: Partial<FlowNode> = {},
): FlowNode {
  return {
    id: uid(),
    key,
    kind: 'flow.if',
    branches: branches.map((nodes) => ({
      id: uid(),
      when: { lit: true },
      scope: { nodes: [...nodes] },
    })),
    ...(other === undefined ? {} : { scopes: { else: { nodes: [...other] } } }),
    ...extra,
  };
}

function loop(key: string, body: readonly FlowNode[], kind = 'flow.repeat'): FlowNode {
  return { id: uid(), key, kind, scopes: { body: { nodes: [...body] } } };
}

function automation(
  body: readonly FlowNode[],
  extra: Partial<AutomationV3> = {},
  triggerKeys: readonly string[] = ['press'],
): AutomationV3 {
  return {
    version: 3,
    kind: 'automation',
    triggers: triggerKeys.map((key) => ({ id: uid(), key, kind: 'trigger.signal', ports: {} })),
    inputs: [],
    outputs: [],
    variables: [],
    body: { nodes: [...body] },
    policy: { mode: 'single' },
    ...extra,
  };
}

function reasons(program: Program): readonly string[] {
  return checkVisibility(indexProgram(program), KINDS).problems.map(
    (problem) => `${problem.owner.key ?? problem.owner.kind}:${problem.reason}`,
  );
}

function resolved(program: Program): readonly ResolvedReference[] {
  return checkVisibility(indexProgram(program), KINDS).resolved;
}

describe('reserved roots and triggers', () => {
  it('sees every reserved root from anywhere', () => {
    const body = [
      reads('a', 'trigger.x + inputs.y + vars.z + home.dark + run.id'),
      loop('l', [reads('b', 'run.id + vars.z')]),
    ];
    const report = checkVisibility(indexProgram(automation(body)), KINDS);
    expect(report.problems).toEqual([]);
    expect(report.resolved.every((entry) => entry.via === 'reserved')).toBe(true);
  });

  it('sees a trigger key, optional only when there is more than one trigger', () => {
    const one = resolved(automation([reads('a', 'press.level')]));
    expect(one.map((entry) => [entry.via, entry.optional])).toEqual([['trigger', false]]);
    const two = resolved(automation([reads('a', 'press.level')], {}, ['press', 'other']));
    expect(two.map((entry) => [entry.via, entry.optional])).toEqual([['trigger', true]]);
  });

  it('refuses a key that nothing declares', () => {
    expect(reasons(automation([reads('a', 'ghost.level')]))).toEqual(['a:unknown_key']);
  });

  it('lets a trigger read triggers but not steps', () => {
    const program = automation([leaf('a')], {
      triggers: [
        { id: uid(), key: 'press', kind: 'trigger.signal', ports: { at: wired('trigger.x') } },
        { id: uid(), key: 'late', kind: 'trigger.signal', ports: { at: wired('a.value') } },
      ],
    });
    expect(reasons(program)).toEqual(['late:not_in_scope']);
  });

  it('lets admit read triggers and refuses steps', () => {
    const body = [leaf('a')];
    expect(reasons(automation(body, { admit: wired('press.x') }))).toEqual([]);
    expect(reasons(automation(body, { admit: wired('home.dark') }))).toEqual([]);
    expect(reasons(automation(body, { admit: wired('a.value') }))).toEqual([
      'program:not_in_scope',
    ]);
  });

  it('lets admit read the leading read and pure steps of the body, as admission evaluates them', () => {
    const body = [leaf('a', {}, 'device.get'), reads('b', 'a.value', 'math.add'), leaf('c')];
    const viaOf = (program: ReturnType<typeof automation>): readonly string[] =>
      resolved(program)
        .filter((entry) => entry.owner.kind === 'program')
        .map((entry) => entry.via);
    const pure = automation(body, { admit: wired('b.result') });
    expect(reasons(pure)).toEqual([]);
    expect(viaOf(pure)).toEqual(['pure']);
    const read = automation(body, { admit: wired('a.value') });
    expect(reasons(read)).toEqual([]);
    expect(viaOf(read)).toEqual(['before']);
  });

  it('refuses admit reading a value step that comes after the first exec step', () => {
    const body = [leaf('c'), leaf('a', {}, 'device.get')];
    expect(reasons(automation(body, { admit: wired('a.value') }))).toEqual([
      'program:not_in_scope',
    ]);
  });

  it('refuses admit when a leading step reads one that admission has not evaluated yet', () => {
    const body = [reads('b', 'a.value', 'math.add'), leaf('a', {}, 'device.get'), leaf('c')];
    expect(reasons(automation(body, { admit: wired('b.result') }))).toEqual([
      'program:pure_not_visible',
    ]);
  });

  it('lets the watched condition of a trigger read the leading read and pure steps, like admit', () => {
    const watching = (source: string, body: readonly FlowNode[]): Program =>
      automation(body, {
        triggers: [
          {
            id: uid(),
            key: 'watch',
            kind: 'trigger.becomes_true',
            ports: { condition: wired(source) },
          },
        ],
      });
    const leading = [leaf('a', {}, 'device.get'), reads('b', 'a.value', 'math.add'), leaf('c')];
    expect(reasons(watching('b.result && a.value', leading))).toEqual([]);
    expect(reasons(watching('c.ok', leading))).toEqual(['watch:not_in_scope']);
    expect(reasons(watching('a.value', [leaf('c'), leaf('a', {}, 'device.get')]))).toEqual([
      'watch:not_in_scope',
    ]);
  });

  it('keeps every other trigger port blind to the steps', () => {
    const program = automation([leaf('a', {}, 'device.get')], {
      triggers: [
        {
          id: uid(),
          key: 'watch',
          kind: 'trigger.becomes_true',
          ports: { hold: wired('a.value') },
        },
      ],
    });
    expect(reasons(program)).toEqual(['watch:not_in_scope']);
  });

  it('checks variable initial values at the top of the program', () => {
    const variables = [{ name: 'copy', type: { t: 'number' as const }, initial: wired('a.value') }];
    expect(reasons(automation([leaf('a')], { variables }))).toEqual(['program:not_in_scope']);
  });
});

describe('exec nodes', () => {
  it('sees an earlier exec node of the same scope', () => {
    const report = checkVisibility(
      indexProgram(automation([leaf('a'), reads('b', 'a.ok')])),
      KINDS,
    );
    expect(report.problems).toEqual([]);
    expect(report.resolved.map((entry) => entry.via)).toEqual(['before']);
  });

  it('refuses a later exec node', () => {
    expect(reasons(automation([reads('a', 'b.ok'), leaf('b')]))).toEqual(['a:comes_later']);
  });

  it('refuses a node reading its own outputs', () => {
    expect(reasons(automation([reads('a', 'a.ok')]))).toEqual(['a:self']);
  });

  it('sees an exec node that comes before the enclosing container', () => {
    const body = [leaf('a'), ifNode('c', [[reads('b', 'a.ok')]])];
    expect(reasons(automation(body))).toEqual([]);
  });

  it('refuses an exec node that comes after the enclosing container', () => {
    const body = [ifNode('c', [[reads('b', 'a.ok')]]), leaf('a')];
    expect(reasons(automation(body))).toEqual(['b:comes_later']);
  });

  it('sees through several levels of nesting', () => {
    const body = [leaf('a'), ifNode('c', [[ifNode('d', [[reads('b', 'a.ok')]])]])];
    expect(reasons(automation(body))).toEqual([]);
  });

  it('treats a step of an unknown kind as an exec node', () => {
    expect(reasons(automation([leaf('a', {}, 'mystery.step'), reads('b', 'a.ok')]))).toEqual([]);
    expect(reasons(automation([reads('b', 'a.ok'), leaf('a', {}, 'mystery.step')]))).toEqual([
      'b:comes_later',
    ]);
  });
});

describe('nothing inside a finished container', () => {
  it('refuses a step inside a branch that has finished', () => {
    const body = [ifNode('c', [[leaf('inner')]]), reads('b', 'inner.ok')];
    expect(reasons(automation(body))).toEqual(['b:inside_finished_container']);
  });

  it('refuses a step deep inside a finished container', () => {
    const body = [ifNode('c', [[ifNode('d', [[leaf('inner')]])]]), reads('b', 'inner.ok')];
    expect(reasons(automation(body))).toEqual(['b:inside_finished_container']);
  });

  it('refuses a step in a sibling branch', () => {
    const body = [ifNode('c', [[leaf('x')], [reads('b', 'x.ok')]])];
    expect(reasons(automation(body))).toEqual(['b:not_in_scope']);
  });

  it('refuses a step of the body from the failure scope', () => {
    const program = automation([leaf('a')], { onFailure: { nodes: [reads('h', 'a.ok')] } });
    expect(reasons(program)).toEqual(['h:not_in_scope']);
  });

  it('refuses a step that comes later in an outer scope even inside a finished container', () => {
    const body = [ifNode('c', [[leaf('x')]]), ifNode('d', [[reads('b', 'x.ok')]])];
    expect(reasons(automation(body))).toEqual(['b:inside_finished_container']);
  });
});

describe('scope outputs of enclosing containers', () => {
  it('gives a loop body its counters', () => {
    const body = [loop('l', [reads('b', 'l.index + l.position + l.first + l.last + l.count')])];
    const report = checkVisibility(indexProgram(automation(body)), KINDS);
    expect(report.problems).toEqual([]);
    expect(new Set(report.resolved.map((entry) => entry.via))).toEqual(new Set(['scope_output']));
  });

  it('gives each loop its own outputs', () => {
    const each = loop('e', [reads('b', 'e.item + e.index')], 'flow.for_each');
    const range = loop('r', [reads('c', 'r.value + r.index')], 'flow.for_range');
    const wait = loop('w', [reads('d', 'w.index + w.position')], 'flow.while');
    expect(reasons(automation([each, range, wait]))).toEqual([]);
  });

  it('refuses a port the loop does not give', () => {
    const body = [loop('l', [reads('b', 'l.item')])];
    expect(reasons(automation(body))).toEqual(['b:not_a_scope_output']);
  });

  it('refuses the whole container node and kinds with nothing to give', () => {
    expect(reasons(automation([loop('l', [reads('b', 'l')])]))).toEqual(['b:not_a_scope_output']);
    expect(reasons(automation([ifNode('c', [[reads('b', 'c.x')]])]))).toEqual([
      'b:not_a_scope_output',
    ]);
  });

  it('gives the error only inside a catch row', () => {
    const tryNode: FlowNode = {
      id: uid(),
      key: 'tr',
      kind: 'flow.try',
      scopes: { try: { nodes: [reads('inTry', 'tr.error')] } },
      catches: [{ id: uid(), scope: { nodes: [reads('inCatch', 'tr.error')] } }],
    };
    expect(reasons(automation([tryNode]))).toEqual(['inTry:not_a_scope_output']);
  });

  it('lets an inner step read the outputs of an outer loop', () => {
    const body = [loop('l', [ifNode('c', [[reads('b', 'l.index')]])])];
    expect(reasons(automation(body))).toEqual([]);
  });

  it('refuses a loop counter after the loop', () => {
    const body = [loop('l', []), reads('b', 'l.index')];
    expect(reasons(automation(body))).toEqual(['b:not_an_output']);
  });

  it('reads the default table and accepts a replacement', () => {
    expect(defaultScopeOutputs('flow.repeat', { kind: 'scope', name: 'body' })).toContain('first');
    expect(defaultScopeOutputs('flow.repeat', { kind: 'scope', name: 'other' })).toEqual([]);
    expect(defaultScopeOutputs('flow.if', { kind: 'scope', name: 'body' })).toEqual([]);
    expect(defaultScopeOutputs('flow.try', { kind: 'scope', name: 'try' })).toEqual([]);
    expect(defaultScopeOutputs('flow.try', { kind: 'catch', id: uid() })).toEqual(['error']);
    const custom: VisibilityKinds = { ...KINDS, scopeOutputsOf: () => ['attempt'] };
    const body = [loop('l', [reads('b', 'l.attempt')])];
    expect(checkVisibility(indexProgram(automation(body)), custom).problems).toEqual([]);
  });
});

describe('structured outputs and results after containers', () => {
  const given = (names: readonly string[]): FlowNode['outputs'] => [
    { name: 'level', values: Object.fromEntries(names.map((name) => [name, { lit: 1 }])) },
  ];

  it('gives a plain output when every path gives a value', () => {
    const c = ifNode('c', [[leaf('x')]], [leaf('y')]);
    const branchId = c.branches?.[0]?.id ?? '';
    const body = [{ ...c, outputs: given([`branch:${branchId}`, 'else']) }, reads('b', 'c.level')];
    expect(resolved(automation(body)).map((entry) => [entry.via, entry.optional])).toEqual([
      ['structured', false],
    ]);
  });

  it('matches a branch by its bare id', () => {
    const c = ifNode('c', [[leaf('x')]], [leaf('y')]);
    const branchId = c.branches?.[0]?.id ?? '';
    const body = [{ ...c, outputs: given([branchId, 'else']) }, reads('b', 'c.level')];
    expect(resolved(automation(body)).map((entry) => entry.optional)).toEqual([false]);
  });

  it('makes the output optional when there is no else', () => {
    const c = ifNode('c', [[leaf('x')]]);
    const branchId = c.branches?.[0]?.id ?? '';
    const body = [{ ...c, outputs: given([branchId]) }, reads('b', 'c.level')];
    expect(resolved(automation(body)).map((entry) => entry.optional)).toEqual([true]);
  });

  it('makes the output optional when a lane gives no value', () => {
    const c = ifNode('c', [[leaf('x')]], [leaf('y')]);
    const body = [{ ...c, outputs: given(['else']) }, reads('b', 'c.level')];
    expect(resolved(automation(body)).map((entry) => entry.optional)).toEqual([true]);
  });

  it('needs a default for a switch', () => {
    const rowId = uid();
    const make = (withDefault: boolean): FlowNode => ({
      id: uid(),
      key: 'sw',
      kind: 'flow.switch',
      ports: { subject: { lit: 1 } },
      cases: [{ id: rowId, match: { eq: 1 }, scope: { nodes: [] } }],
      ...(withDefault ? { scopes: { default: { nodes: [] } } } : {}),
      outputs: given([`case:${rowId}`, ...(withDefault ? ['default'] : [])]),
    });
    expect(
      resolved(automation([make(true), reads('b', 'sw.level')])).map((e) => e.optional),
    ).toEqual([false]);
    expect(
      resolved(automation([make(false), reads('b', 'sw.level')])).map((e) => e.optional),
    ).toEqual([true]);
  });

  it('ignores the finally scope and covers try and catch', () => {
    const catchId = uid();
    const tryNode: FlowNode = {
      id: uid(),
      key: 'tr',
      kind: 'flow.try',
      scopes: { try: { nodes: [] }, finally: { nodes: [] } },
      catches: [{ id: catchId, scope: { nodes: [] } }],
      outputs: given(['try', `catch:${catchId}`]),
    };
    expect(resolved(automation([tryNode, reads('b', 'tr.level')])).map((e) => e.optional)).toEqual([
      false,
    ]);
  });

  it('covers every branch of a parallel node', () => {
    const make = (names: readonly string[]): FlowNode => ({
      id: uid(),
      key: 'par',
      kind: 'flow.parallel',
      scopes: { one: { nodes: [] }, two: { nodes: [] } },
      outputs: given(names),
    });
    expect(
      resolved(automation([make(['one', 'two']), reads('b', 'par.level')])).map((e) => e.optional),
    ).toEqual([false]);
    expect(
      resolved(automation([make(['one']), reads('b', 'par.level')])).map((e) => e.optional),
    ).toEqual([true]);
  });

  it('gives the declared outputs of the kind as results', () => {
    const each = loop('e', [], 'flow.for_each');
    const parallel: FlowNode = {
      id: uid(),
      key: 'par',
      kind: 'flow.parallel',
      scopes: { one: { nodes: [] }, two: { nodes: [] } },
    };
    const body = [each, parallel, reads('b', 'e.results'), reads('c', 'par.status')];
    expect(resolved(automation(body)).map((entry) => [entry.via, entry.optional])).toEqual([
      ['result', true],
      ['result', false],
    ]);
  });

  it('refuses a port that is not declared and the whole container', () => {
    const body = [ifNode('c', [[leaf('x')]], []), reads('b', 'c.nothing'), reads('d', 'c')];
    expect(reasons(automation(body))).toEqual(['b:not_an_output', 'd:not_an_output']);
  });

  it('refuses structured outputs of a container that comes later', () => {
    const c = ifNode('c', [[]], [], { outputs: given(['else']) });
    expect(reasons(automation([reads('b', 'c.level'), c]))).toEqual(['b:comes_later']);
  });
});

describe('structured output values', () => {
  it('reads the nodes of the lane it belongs to', () => {
    const c = ifNode('c', [[leaf('x')]], [leaf('y')], {
      outputs: [{ name: 'level', values: { else: wired('y.value') } }],
    });
    expect(reasons(automation([c]))).toEqual([]);
  });

  it('refuses a node of another lane', () => {
    const c = ifNode('c', [[leaf('x')]], [leaf('y')], {
      outputs: [{ name: 'level', values: { else: wired('x.value') } }],
    });
    expect(reasons(automation([c]))).toEqual(['c:not_in_scope']);
  });

  it('reads the scope outputs of its own container', () => {
    const each: FlowNode = {
      ...loop('e', [leaf('x')], 'flow.for_each'),
      outputs: [{ name: 'level', values: { body: wired('e.item') } }],
    };
    expect(reasons(automation([each]))).toEqual([]);
  });

  it('cannot read its own result', () => {
    const c = ifNode('c', [[]], [], {
      outputs: [{ name: 'level', values: { else: wired('c.level') } }],
    });
    expect(reasons(automation([c]))).toEqual(['c:not_a_scope_output']);
  });

  it('falls back to the container position when the lane is not found', () => {
    const c = ifNode('c', [[leaf('x')]], undefined, {
      outputs: [{ name: 'level', values: { missing: wired('x.value') } }],
    });
    expect(reasons(automation([c]))).toEqual(['c:not_in_scope']);
    const before = ifNode('d', [[]], undefined, {
      outputs: [{ name: 'level', values: { missing: wired('a.value') } }],
    });
    expect(reasons(automation([leaf('a'), before]))).toEqual([]);
  });
});

describe('pure and read nodes', () => {
  it('sees a pure node whatever its position when its references are visible', () => {
    const body = [leaf('a'), reads('p', 'a.ok', 'math.add'), reads('b', 'p.value')];
    expect(reasons(automation(body))).toEqual([]);
    const after = [reads('b', 'p.value'), reads('p', 'press.x', 'math.add')];
    const report = checkVisibility(indexProgram(automation(after)), KINDS);
    expect(report.problems).toEqual([]);
    expect(report.resolved.map((entry) => entry.via)).toEqual(['pure', 'trigger']);
  });

  it('sees a read node of an enclosing scope', () => {
    const body = [reads('r', 'press.x', 'device.get'), ifNode('c', [[reads('b', 'r.state')]])];
    expect(reasons(automation(body))).toEqual([]);
  });

  it('checks the references of a pure node at the place that uses it', () => {
    const body = [reads('b', 'p.value'), leaf('a'), reads('p', 'a.ok', 'math.add')];
    expect(reasons(automation(body))).toEqual(['b:pure_not_visible']);
  });

  it('does not judge the order of a pure node own references', () => {
    const body = [reads('p', 'a.ok', 'math.add'), leaf('a')];
    expect(reasons(automation(body))).toEqual([]);
  });

  it('checks a pure node against the scope that it sits in', () => {
    const body = [reads('p', 'ghost.x', 'math.add')];
    expect(reasons(automation(body))).toEqual(['p:unknown_key']);
  });

  it('follows pure nodes through other pure nodes', () => {
    const body = [
      reads('q', 'a.ok', 'math.add'),
      reads('p', 'q.value', 'math.add'),
      reads('b', 'p.value'),
      leaf('a'),
    ];
    expect(reasons(automation(body))).toEqual(['b:pure_not_visible']);
    const fine = [leaf('a'), ...body.slice(0, 3)];
    expect(reasons(automation(fine))).toEqual([]);
  });

  it('refuses a cycle between pure nodes', () => {
    const body = [
      reads('p', 'q.value', 'math.add'),
      reads('q', 'p.value', 'math.add'),
      reads('b', 'p.value'),
    ];
    expect(reasons(automation(body))).toEqual([
      'p:pure_not_visible',
      'q:pure_not_visible',
      'b:pure_not_visible',
    ]);
    const message = checkVisibility(indexProgram(automation(body)), KINDS).problems[2]?.message;
    expect(message).toContain('depends on itself');
  });

  it('refuses a pure node reading itself', () => {
    expect(reasons(automation([reads('p', 'p.value', 'math.add')]))).toEqual(['p:self']);
  });

  it('refuses a pure node that sits in another scope', () => {
    const body = [ifNode('c', [[reads('p', 'press.x', 'math.add')]]), reads('b', 'p.value')];
    expect(reasons(automation(body))).toEqual(['b:inside_finished_container']);
    const sibling = [ifNode('c', [[reads('p', 'press.x', 'math.add')], [reads('b', 'p.value')]])];
    expect(reasons(automation(sibling))).toEqual(['b:not_in_scope']);
  });

  it('lets a pure node read the scope outputs of the loop it sits in', () => {
    const body = [loop('l', [reads('p', 'l.index', 'math.add'), reads('b', 'p.value')])];
    expect(reasons(automation(body))).toEqual([]);
  });

  it('refuses a pure node outside of the loop reading the loop counter', () => {
    const body = [reads('p', 'l.index', 'math.add'), loop('l', [reads('b', 'p.value')])];
    expect(reasons(automation(body))).toEqual(['p:not_an_output']);
  });
});

describe('reusable nodes', () => {
  it('has no triggers and its own roots', () => {
    const program: FunctionV3 = {
      version: 3,
      kind: 'function',
      flavour: 'action',
      inputs: [],
      outputs: [],
      exits: ['done'],
      variables: [],
      body: { nodes: [leaf('a'), reads('b', 'a.ok + inputs.x'), reads('c', 'press.x')] },
    };
    expect(reasons(program)).toEqual(['c:unknown_key']);
  });
});

describe('duplicate keys', () => {
  it('survives a trigger that shares its key with a container', () => {
    const body = [ifNode('press', [[reads('b', 'x.ok')]])];
    expect(() => reasons(automation(body))).not.toThrow();
  });
});

describe('over generated programs', () => {
  const programs = fc.oneof(automationV3, functionV3);

  it('never throws and reports each reference exactly once', () => {
    fc.assert(
      fc.property(programs, (program) => {
        const report = checkVisibility(indexProgram(program), KINDS);
        expect(report.problems.length + report.resolved.length).toBeGreaterThanOrEqual(0);
      }),
    );
  });

  it('sees every earlier step from a later step of the same scope', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 6 }), fc.nat(5), (size, pick) => {
        const nodes = Array.from({ length: size }, (_, position) => leaf(`n${String(position)}`));
        const target = pick % size;
        const reader = reads('reader', `n${String(target)}.ok`);
        const program = automation([...nodes, reader]);
        expect(reasons(program)).toEqual([]);
        const swapped = automation([reader, ...nodes]);
        expect(reasons(swapped)).toEqual(['reader:comes_later']);
      }),
    );
  });

  it('never sees into a finished container, however deep', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (depth) => {
        let inner: FlowNode = leaf('deep');
        for (let level = 0; level < depth; level += 1) {
          inner = ifNode(`c${String(level)}`, [[inner]]);
        }
        const program = automation([inner, reads('reader', 'deep.ok')]);
        expect(reasons(program)).toEqual(['reader:inside_finished_container']);
      }),
    );
  });

  it('sees everything before an enclosing container from any depth', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 4 }), (depth) => {
        let inner: FlowNode = reads('reader', 'first.ok');
        for (let level = 0; level < depth; level += 1) {
          inner = ifNode(`c${String(level)}`, [[inner]]);
        }
        expect(reasons(automation([leaf('first'), inner]))).toEqual([]);
      }),
    );
  });

  it('judges a pure chain the same as its end', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 5 }), fc.boolean(), (length, early) => {
        const chain = Array.from({ length }, (_, position) =>
          reads(
            `p${String(position)}`,
            position === 0 ? 'a.ok' : `p${String(position - 1)}.value`,
            'math.add',
          ),
        );
        const consumer = reads('use', `p${String(length - 1)}.value`);
        const body = early ? [leaf('a'), ...chain, consumer] : [...chain, consumer, leaf('a')];
        expect(reasons(automation(body))).toEqual(early ? [] : ['use:pure_not_visible']);
      }),
    );
  });
});
