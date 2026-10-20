import type { FlowNode, FunctionV3, PortValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { detachInstance } from '../../src/extract/detach';
import {
  FUNCTION_ID,
  automation,
  branching,
  detachRefusal,
  detached,
  wired,
  extracted,
  functionProgram,
  giveBack,
  keysOf,
  lit,
  node,
  portAt,
  probe,
  pure,
  repeating,
  withPress,
} from './support';

const NUMBER = { t: 'number' } as const;

function ids(): () => string {
  let counter = 0;
  return () => {
    counter += 1;
    return `dddddddd-dddd-4ddd-8ddd-${counter.toString(16).padStart(12, '0')}`;
  };
}

function call(
  key: string,
  ports: Record<string, PortValue> = {},
  extra: Partial<FlowNode> = {},
): FlowNode {
  return node(key, 'fn.call', { fn: lit(FUNCTION_ID), ...ports }, extra);
}

function reusable(body: FlowNode[], shape: Partial<FunctionV3> = {}): FunctionV3 {
  return functionProgram(body, shape);
}

describe('detachInstance', () => {
  it('puts back what extraction took out', () => {
    const program = withPress(
      automation([
        probe('first', { label: wired('trigger.subject') }),
        probe('second', { count: wired('first.out') }),
        probe('third', { count: wired('second.out') }),
      ]),
    );
    const { caller, callee } = extracted(program, ['first', 'second']);
    expect(detached(caller, 'makeTea', callee)).toEqual(program);
  });

  it('puts back reads of loop values and of nodes outside the scope', () => {
    const program = automation([
      pure('base'),
      repeating('rep', [
        probe('inner', { count: wired('rep.index'), label: wired('base.result') }),
      ]),
    ]);
    const { caller, callee } = extracted(program, ['inner']);
    expect(callee.inputs.map((port) => port.name)).toEqual(['repIndex', 'baseResult']);
    expect(detached(caller, 'makeTea', callee)).toEqual(program);
  });

  it('refuses what is not a reusable node instance', () => {
    const program = automation([probe('a'), call('empty', {}, {})]);
    expect(detachRefusal(program, 'ghost', reusable([])).code).toBe('unknown_key');
    expect(detachRefusal(program, 'a', reusable([])).code).toBe('unknown_key');
    const unnamed = automation([node('bare', 'fn.call', {})]);
    expect(detachRefusal(unnamed, 'bare', reusable([])).code).toBe('unsupported');
  });

  it('refuses bodies that cannot be inlined', () => {
    const program = automation([call('c')]);
    const exits = reusable([], { exits: ['done', 'other'] });
    expect(detachRefusal(program, 'c', exits).code).toBe('unsupported');
    const renamed = reusable([], { exits: ['other'] });
    expect(detachRefusal(program, 'c', renamed).code).toBe('unsupported');
    const early = reusable([giveBack(), probe('a')]);
    expect(detachRefusal(program, 'c', early).code).toBe('control');
    const guarded = reusable([node('g', 'flow.guard', { condition: lit(true) }), probe('a')]);
    expect(detachRefusal(program, 'c', guarded).code).toBe('control');
    const leaving = reusable([probe('a'), giveBack({ exit: lit('other') })]);
    expect(detachRefusal(program, 'c', leaving).code).toBe('control');
    const stray = automation([call('c', {}, { scopes: { other: { nodes: [probe('x')] } } })]);
    expect(detachRefusal(stray, 'c', reusable([probe('a')])).code).toBe('unsupported');
  });

  it('accepts a guard deeper in the body and a final return to done', () => {
    const body = reusable([
      branching('cond', [node('g', 'flow.guard', { condition: lit(true) })]),
      giveBack({ exit: lit('done') }),
    ]);
    const back = detached(automation([call('c')]), 'c', body);
    expect(keysOf(back)).toEqual(['cond']);
  });

  it('keeps the steps that follow the done exit of the instance', () => {
    const program = automation([
      call('c', {}, { scopes: { done: { nodes: [probe('next')] } } }),
      probe('last'),
    ]);
    expect(keysOf(detached(program, 'c', reusable([probe('a')])))).toEqual(['a', 'next', 'last']);
  });
});

describe('inputs', () => {
  const callee = reusable([probe('a', { count: wired('inputs.n'), label: wired('inputs.text') })], {
    inputs: [
      { name: 'n', type: NUMBER, required: true },
      { name: 'text', type: { t: 'text' }, required: true },
    ],
  });

  it('puts the wire the caller gave in place of the input', () => {
    const program = automation([
      probe('first'),
      call('c', { n: wired('first.out'), text: wired('trigger.subject') }),
    ]);
    const back = detached(program, 'c', callee);
    expect(back.body.nodes[1]?.ports).toMatchObject({
      count: { wire: { from: 'first', port: 'out' } },
      label: { wire: { from: 'trigger', port: 'subject' } },
    });
  });

  it('puts a given constant in place of the input', () => {
    const back = detached(automation([call('c', { n: lit(4), text: lit('hi') })]), 'c', callee);
    expect(keysOf(back)).toEqual(['a']);
    expect(back.body.nodes[0]?.ports).toMatchObject({ count: { lit: 4 }, label: { lit: 'hi' } });
  });

  it('uses the default of an input that is not given and null for an optional one', () => {
    const shaped = reusable(
      [probe('a', { count: wired('inputs.n'), label: wired('inputs.text') })],
      {
        inputs: [
          { name: 'n', type: NUMBER, required: false, default: 7 },
          { name: 'text', type: { t: 'optional', of: { t: 'text' } }, required: false },
        ],
      },
    );
    const back = detached(automation([call('c')]), 'c', shaped);
    expect(back.body.nodes[0]?.ports).toMatchObject({ count: { lit: 7 }, label: { lit: null } });
  });

  it('leaves reads of unknown inputs alone', () => {
    const odd = reusable([probe('a', { count: wired('inputs.ghost') })]);
    expect(detached(automation([call('c')]), 'c', odd).body.nodes[0]?.ports?.['count']).toEqual({
      wire: { from: 'inputs', port: 'ghost' },
    });
  });
});

describe('outputs', () => {
  const shape = { outputs: [{ name: 'out', type: NUMBER }] };

  it('reads the returned value instead of the instance', () => {
    const callee = reusable([probe('a'), giveBack({ out: wired('a.out') })], shape);
    const program = automation([call('c'), probe('z', { count: wired('c.out') })]);
    const back = detached(program, 'c', callee);
    expect(back.body.nodes[1]?.ports?.['count']).toEqual({ wire: { from: 'a', port: 'out' } });
  });

  it('puts a returned constant in place of the output', () => {
    const literal = reusable([probe('a'), giveBack({ out: lit(5) })], shape);
    const program = automation([call('c'), probe('z', { count: wired('c.out') })]);
    const back = detached(program, 'c', literal);
    expect(keysOf(back)).toEqual(['a', 'z']);
    expect(back.body.nodes[1]?.ports?.['count']).toEqual({ lit: 5 });
  });

  it('reads null when nothing is returned and leaves unknown outputs alone', () => {
    const none = reusable([probe('a')], shape);
    const program = automation([
      call('c'),
      probe('z', { count: wired('c.out'), label: wired('c.ghost') }),
    ]);
    const back = detached(program, 'c', none);
    expect(back.body.nodes[1]?.ports).toMatchObject({
      count: { lit: null },
      label: { wire: { from: 'c', port: 'ghost' } },
    });
    const partial = reusable([giveBack()], shape);
    expect(detached(program, 'c', partial).body.nodes[0]?.ports).toMatchObject({
      count: { lit: null },
    });
  });
});

describe('names', () => {
  it('renames keys that are taken and gives new ids to nodes that clash', () => {
    const callee = reusable([
      probe('first'),
      branching('cond', [probe('inner', { count: wired('first.out') })]),
    ]);
    const program = automation([probe('first'), call('c')]);
    const result = detachInstance(program, 'c', callee, { newId: ids() });
    expect(result.ok ? '' : result.reason).toBe('');
    if (!result.ok) return;
    expect(result.renamed).toEqual({ first: 'first2' });
    expect(keysOf(result.program)).toEqual(['first', 'first2', 'cond']);
    const cond = result.program.body.nodes[2];
    expect(cond?.branches?.[0]?.scope.nodes[0]?.ports?.['count']).toEqual({
      wire: { from: 'first2', port: 'out' },
    });
  });

  it('gives fresh ids to rows when the same body is inlined twice', () => {
    const rows: FlowNode[] = [
      branching('cond', [probe('inner')]),
      {
        ...node('pick', 'flow.switch'),
        cases: [
          { id: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', match: { eq: 1 }, scope: { nodes: [] } },
        ],
      },
      {
        ...node('safe', 'flow.try'),
        scopes: { try: { nodes: [] } },
        catches: [{ id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', scope: { nodes: [] } }],
      },
    ];
    const callee = reusable(rows);
    const newId = ids();
    const program = automation([call('one'), call('two')]);
    const first = detachInstance(program, 'one', callee, { newId });
    expect(first.ok ? '' : first.reason).toBe('');
    if (!first.ok) return;
    const second = detachInstance(first.program, 'two', callee, { newId });
    expect(second.ok ? '' : second.reason).toBe('');
    if (!second.ok) return;
    expect(keysOf(second.program)).toEqual(['cond', 'pick', 'safe', 'cond2', 'pick2', 'safe2']);
    const ids2 = [second.program.body.nodes[1], second.program.body.nodes[4]].map(
      (entry) => entry?.cases?.[0]?.id,
    );
    expect(new Set(ids2).size).toBe(2);
  });
});

describe('variables', () => {
  const callee = reusable(
    [
      node('look', 'var.get', { name: lit('level') }),
      node('bump', 'var.change', {
        source: lit('run'),
        name: lit('level'),
        op: lit('add'),
        amount: wired('inputs.n'),
      }),
      node('home1', 'var.get', { source: lit('home'), value: lit('value-1') }),
      node('dyn', 'var.get', { name: wired('trigger.x') }),
      node('keep', 'var.get', { source: lit('automation'), name: lit('level') }),
      node('num', 'var.get', { name: lit(3) }),
      probe('a', { count: wired('vars.level') }),
    ],
    {
      inputs: [{ name: 'n', type: NUMBER, required: true }],
      variables: [{ name: 'level', type: NUMBER, initial: wired('inputs.n') }],
    },
  );

  it('moves the variables of the body into the caller under free names', () => {
    const program = {
      ...automation([call('c', { n: lit(2) })]),
      variables: [{ name: 'level', type: NUMBER, initial: lit(0) } as const],
    };
    const back = detached(program, 'c', callee);
    expect(back.variables.map((variable) => variable.name)).toEqual(['level', 'level2']);
    expect(back.variables[1]?.initial).toEqual({ lit: 2 });
    expect(portAt(back, 0, 'name')).toEqual({ lit: 'level2' });
    expect(portAt(back, 1, 'name')).toEqual({ lit: 'level2' });
    expect(portAt(back, 2, 'value')).toEqual({ lit: 'value-1' });
    expect(portAt(back, 3, 'name')).toEqual({ wire: { from: 'trigger', port: 'x' } });
    expect(portAt(back, 4, 'name')).toEqual({ lit: 'level' });
    expect(portAt(back, 5, 'name')).toEqual({ lit: 3 });
    expect(portAt(back, 6, 'count')).toEqual({ wire: { from: 'vars', port: 'level2' } });
  });

  it('keeps the name of a variable when it is free', () => {
    const back = detached(automation([call('c', { n: lit(2) })]), 'c', callee);
    expect(back.variables.map((variable) => variable.name)).toEqual(['level']);
    expect(back.body.nodes[1]?.ports?.['name']).toEqual({ lit: 'level' });
  });
});

describe('invalid results', () => {
  it('refuses when a node given a new id would not be valid', () => {
    const program = automation([call('c', { n: lit(1) })]);
    const clash = program.body.nodes[0]?.id ?? '';
    const callee = reusable([{ ...probe('a', { count: wired('inputs.n') }), id: clash }], {
      inputs: [{ name: 'n', type: NUMBER, required: true }],
    });
    const result = detachInstance(program, 'c', callee, { newId: () => 'not-a-uuid' });
    expect(result.ok ? '' : result.code).toBe('invalid_result');
  });
});

describe('default ids', () => {
  it('makes up ids for the nodes it adds', () => {
    const program = automation([call('c', { n: lit(1) })]);
    const callee = reusable([probe('a', { count: wired('inputs.n') })], {
      inputs: [{ name: 'n', type: NUMBER, required: true }],
    });
    const result = detachInstance(program, 'c', callee);
    expect(result.ok).toBe(true);
  });
});

describe('functions and whole reads', () => {
  it('inlines into a reusable node', () => {
    const program = functionProgram([call('c'), probe('z')]);
    const back = detached(program, 'c', reusable([probe('a')]));
    expect(keysOf(back)).toEqual(['a', 'z']);
  });

  it('leaves variables it cannot rename alone', () => {
    const callee = reusable([probe('a', { label: wired('vars.ghost') })]);
    const back = detached(automation([call('c')]), 'c', callee);
    expect(back.body.nodes[0]?.ports).toMatchObject({
      label: { wire: { from: 'vars', port: 'ghost' } },
    });
  });
});
