import type { AutomationV3, FlowNode, FunctionV3, PortValue } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { editWires, mapProgram, valuesOnly, wireKey, wiresOf } from '../../src/extract/values';
import { uuid } from '../check/c23-support';
import { automation, functionProgram, lit, node, trigger } from './support';

const mark = (): PortValue => ({ lit: 'mapped' });

function everySite(): AutomationV3 {
  const ifNode: FlowNode = {
    ...node('branchy', 'flow.if', { a: lit('orig-port') }),
    branches: [
      {
        id: uuid(),
        when: lit('orig-when'),
        scope: { nodes: [node('inside', 'probe.take', { b: lit('orig-inner') })] },
      },
    ],
    scopes: { else: { nodes: [node('other', 'probe.take', { c: lit('orig-else') })] } },
    outputs: [{ name: 'picked', values: { else: lit('orig-output') } }],
  };
  const switchNode: FlowNode = {
    ...node('picker', 'flow.switch'),
    cases: [
      { id: uuid(), match: { eq: 1 }, scope: { nodes: [] } },
      { id: uuid(), match: { when: lit('orig-case') }, scope: { nodes: [] } },
    ],
  };
  const tryNode: FlowNode = {
    ...node('safe', 'flow.try'),
    scopes: { try: { nodes: [] } },
    catches: [
      { id: uuid(), scope: { nodes: [node('recover', 'probe.take', { d: lit('orig-catch') })] } },
    ],
  };
  return {
    ...automation([ifNode, switchNode, tryNode], {
      onFailure: { nodes: [node('failed', 'probe.take', { e: lit('orig-failure') })] },
    }),
    triggers: [
      trigger('press', 'trigger.signal', { f: lit('orig-trigger') }),
      trigger('plain', 'trigger.signal', {}),
    ],
    admit: lit('orig-admit'),
    variables: [{ name: 'level', type: { t: 'number' }, initial: lit('orig-initial') }],
  };
}

describe('wire helpers', () => {
  it('leaves constants and untouched wires alone', () => {
    const literal = lit(1);
    expect(editWires(literal, () => lit(2))).toBe(literal);
    const wire: PortValue = { wire: { from: 'a', port: 'b' } };
    expect(editWires(wire, () => undefined)).toBe(wire);
  });

  it('replaces a wire with what the edit gives', () => {
    const wire: PortValue = { wire: { from: 'a', port: 'b' } };
    expect(editWires(wire, (ref) => ({ wire: { from: `${ref.from}x`, port: ref.port } }))).toEqual({
      wire: { from: 'ax', port: 'b' },
    });
    expect(editWires(wire, () => lit(3))).toEqual(lit(3));
  });

  it('lists the wires of a value and keys them', () => {
    expect(wiresOf({ wire: { from: 'a', port: 'b' } })).toEqual([{ from: 'a', port: 'b' }]);
    expect(wiresOf(lit('a.b'))).toEqual([]);
    expect(wireKey({ from: 'a', port: 'b' })).not.toBe(wireKey({ from: 'a.b', port: '' }));
  });
});

describe('mapProgram', () => {
  it('reaches every value of an automation', () => {
    const mapped = mapProgram(everySite(), valuesOnly(mark));
    expect(JSON.stringify(mapped)).not.toContain('orig-');
    expect(JSON.stringify(mapped)).toContain('mapped');
  });

  it('reaches every value of a function and visits nodes', () => {
    const visited: string[] = [];
    const reusable: FunctionV3 = {
      ...functionProgram([node('only', 'probe.take', { g: lit('orig-body') })]),
      variables: [{ name: 'v', type: { t: 'number' }, initial: lit('orig-initial') }],
    };
    const mapped = mapProgram(reusable, {
      value: mark,
      node: (entry) => {
        visited.push(entry.key);
        return entry;
      },
    });
    expect(JSON.stringify(mapped)).not.toContain('orig-');
    expect(visited).toEqual(['only']);
  });

  it('keeps an automation without admit or handler as it is', () => {
    const plain = automation([node('one', 'probe.take', {})]);
    expect(mapProgram(plain, valuesOnly(mark))).toEqual(plain);
  });
});
