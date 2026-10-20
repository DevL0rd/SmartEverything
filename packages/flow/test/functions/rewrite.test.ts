import type { FlowNode, PortValue, Wire } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { rewriteProgram } from '../../src/functions/rewrite';
import { automation, fn, node, uuid } from './support';

const upper = {
  wire: (wire: Wire): Wire => ({ from: wire.from.toUpperCase(), port: wire.port }),
  node: (entry: FlowNode): FlowNode => entry,
};

const from = (source: string): PortValue => ({ wire: { from: source, port: 'out' } });

function rich(): FlowNode {
  const inner = (key: string): { nodes: FlowNode[] } => ({
    nodes: [node(key, 'notify.feed', { x: from('a'), z: { lit: 'c' } })],
  });
  return {
    ...node('big', 'flow.switch', { p: from('p') }),
    branches: [{ id: uuid(), when: from('w'), scope: inner('inBranch') }],
    cases: [
      { id: uuid(), match: { when: from('m') }, scope: inner('inWhen') },
      { id: uuid(), match: { eq: 'keep' }, scope: inner('inEq') },
    ],
    catches: [{ id: uuid(), scope: inner('inCatch') }],
    scopes: { body: inner('inScope') },
    outputs: [{ name: 'o', values: { body: from('out'), other: { lit: 1 } } }],
  };
}

function sources(value: unknown): string[] {
  return [...JSON.stringify(value).matchAll(/"from":"([^"]*)"/g)].flatMap((match) =>
    match.slice(1),
  );
}

describe('rewriteProgram', () => {
  it('rewrites every wire and leaves constants', () => {
    const program = {
      ...automation([rich()], { nodes: [node('fail', 'notify.feed', { q: from('f') })] }),
      triggers: [
        { id: uuid(), key: 'one', kind: 'trigger.signal', ports: { t: from('tr') } },
        { id: uuid(), key: 'two', kind: 'trigger.signal', ports: {} },
      ],
      admit: from('ad'),
    };
    const result = rewriteProgram(program, upper);
    expect(sources(result).sort()).toEqual(
      sources(program)
        .map((entry) => entry.toUpperCase())
        .sort(),
    );
    expect(JSON.stringify(result)).toContain('"eq":"keep"');
    expect(JSON.stringify(result)).toContain('"lit":"c"');
    expect(sources(program).every((entry) => entry === entry.toLowerCase())).toBe(true);
  });

  it('rewrites a function program and applies the node hook after its children', () => {
    const order: string[] = [];
    const result = rewriteProgram(fn([rich()]), {
      wire: (wire) => wire,
      node: (entry) => {
        order.push(entry.key);
        return entry;
      },
    });
    expect(order.at(-1)).toBe('big');
    expect(order).toContain('inCatch');
    expect(result.kind).toBe('function');
  });

  it('keeps an automation without admit or failure scope free of those fields', () => {
    const result = rewriteProgram(automation([]), upper);
    expect('admit' in result).toBe(false);
    expect('onFailure' in result).toBe(false);
  });
});
