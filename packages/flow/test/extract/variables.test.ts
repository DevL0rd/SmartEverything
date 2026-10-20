import type { AutomationV3 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  automation,
  wired,
  extracted,
  giveBack,
  keysOf,
  lit,
  node,
  probe,
  refusal,
} from './support';

function withLevel(program: AutomationV3, persist = false): AutomationV3 {
  return {
    ...program,
    variables: [
      { name: 'level', type: { t: 'number' }, initial: lit(0), ...(persist ? { persist } : {}) },
    ],
  };
}

describe('run variables', () => {
  it('passes a written variable in and out and writes it back in the caller', () => {
    const program = withLevel(
      automation([
        node('bump', 'var.change', { name: lit('level'), op: lit('add'), amount: lit(1) }),
        probe('after', { count: wired('vars.level') }),
      ]),
    );
    const result = extracted(program, ['bump']);
    expect(result.callee.variables).toEqual([
      {
        name: 'level',
        type: { t: 'number' },
        initial: { wire: { from: 'inputs', port: 'level' } },
      },
    ]);
    expect(result.callee.inputs).toEqual([
      { name: 'level', type: { t: 'number' }, required: true },
    ]);
    expect(result.callee.outputs).toEqual([{ name: 'level', type: { t: 'number' } }]);
    expect(keysOf(result.callee)).toEqual(['bump', 'finish']);
    expect(result.callee.body.nodes[1]?.ports).toEqual({
      level: { wire: { from: 'vars', port: 'level' } },
    });
    expect(keysOf(result.caller)).toEqual(['makeTea', 'setLevel', 'after']);
    const [call, writeBack] = result.caller.body.nodes;
    expect(call?.ports?.['level']).toEqual({ wire: { from: 'vars', port: 'level' } });
    expect(writeBack).toMatchObject({
      kind: 'var.set',
      ports: { name: { lit: 'level' }, to: { wire: { from: 'makeTea', port: 'level' } } },
    });
  });

  it('gives an early return the variable values too', () => {
    const program = withLevel(
      automation([
        node('bump', 'var.set', { source: lit('run'), name: lit('level'), to: lit(3) }),
        giveBack(),
      ]),
    );
    const result = extracted(program, ['bump', 'give']);
    expect(keysOf(result.callee)).toEqual(['bump', 'give']);
    expect(result.callee.body.nodes[1]?.ports).toEqual({
      level: { wire: { from: 'vars', port: 'level' } },
    });
  });

  it('only reads a variable that is not written', () => {
    const program = withLevel(
      automation([
        node('look', 'var.get', { name: lit('level') }),
        probe('a', { count: wired('vars.level') }),
      ]),
    );
    const result = extracted(program, ['look', 'a']);
    expect(result.callee.variables).toHaveLength(1);
    expect(result.callee.outputs).toEqual([]);
    expect(keysOf(result.caller)).toEqual(['makeTea']);
  });

  it('numbers an input that collides with a caller input', () => {
    const program = {
      ...withLevel(
        automation([
          node('bump', 'var.change', {
            name: lit('level'),
            op: lit('add'),
            amount: wired('inputs.level'),
          }),
        ]),
      ),
      inputs: [{ name: 'level', type: { t: 'number' }, required: false } as const],
    };
    const result = extracted(program, ['bump']);
    expect(result.callee.inputs.map((port) => port.name)).toEqual(['level', 'level2']);
    expect(result.callee.variables[0]?.initial).toEqual({
      wire: { from: 'inputs', port: 'level2' },
    });
  });

  it('does not count home values as variables', () => {
    const program = automation([
      node('home1', 'var.set', { source: lit('home'), value: lit('value-1'), to: lit(1) }),
    ]);
    const result = extracted(program, ['home1']);
    expect(result.callee.variables).toEqual([]);
    expect(result.fixed).toEqual([{ key: 'home1', port: 'value', of: 'value' }]);
  });
});

describe('what cannot move', () => {
  it('refuses persistent variables', () => {
    const kept = withLevel(automation([probe('a', { count: wired('vars.level') })]), true);
    expect(refusal(kept, ['a']).code).toBe('persistent');
    const viaNode = withLevel(
      automation([node('keep', 'var.get', { source: lit('automation'), name: lit('level') })]),
    );
    expect(refusal(viaNode, ['keep']).code).toBe('persistent');
  });

  it('refuses variables picked with an expression', () => {
    const named = withLevel(automation([node('pick', 'var.get', { name: wired('trigger.x') })]));
    expect(refusal(named, ['pick']).code).toBe('dynamic');
    const sourced = withLevel(
      automation([node('pick', 'var.get', { source: wired('trigger.x'), name: lit('level') })]),
    );
    expect(refusal(sourced, ['pick']).code).toBe('dynamic');
    const unnamed = withLevel(automation([node('pick', 'var.get', {})]));
    expect(refusal(unnamed, ['pick']).code).toBe('dynamic');
  });

  it('refuses variables the program does not declare', () => {
    expect(
      refusal(automation([node('look', 'var.get', { name: lit('ghost') })]), ['look']).code,
    ).toBe('unknown_variable');
  });
});
