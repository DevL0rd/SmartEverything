import { describe, expect, it } from 'vitest';
import { outlineLines, outlineOf, outlineText } from '../../src/automation-v3/outline';
import type { AutomationV3 } from '../../src/automation-v3/program';
import { CTX, functionProgram, ids, node, pressTrigger, program } from './describe-fixture';

describe('outline', () => {
  it('writes the LANGUAGE.md 11.2 example, one line per node with keys', () => {
    expect(outlineOf(program, CTX)).toBe(
      [
        'when press: When Kitchen switch gets a Single press',
        'cycle: Next level',
        'setLights: Set brightness of light in Kitchen to Cycle level › Value',
      ].join('\n'),
    );
  });

  it('keeps the keyless summary and the label beside the keyed text', () => {
    const [trigger, cycle] = outlineLines(program, CTX);
    expect(trigger).toEqual({
      depth: 0,
      kind: 'trigger',
      key: 'press',
      nodeId: ids.trigger,
      label: 'Button pressed',
      summary: 'When Kitchen switch gets a Single press',
      text: 'when press: When Kitchen switch gets a Single press',
    });
    expect(cycle).toMatchObject({ kind: 'node', key: 'cycle', label: 'Cycle level', depth: 0 });
    expect(cycle?.summary).toBe('Next level');
  });

  it('indents by scope and names every kind of lane', () => {
    const inner = node(1, 'inner', 'device.set');
    const nested: AutomationV3 = {
      ...program,
      triggers: [{ ...pressTrigger, enabled: false }],
      admit: { wire: { from: 'vars', port: 'quiet' } },
      body: {
        nodes: [
          node(2, 'loop', 'flow.for_each', { scopes: { body: { nodes: [inner] } } }),
          node(3, 'check', 'flow.if', {
            branches: [
              {
                id: ids.node,
                when: { wire: { from: 'vars', port: 'bright' } },
                scope: { nodes: [inner] },
              },
            ],
            scopes: { else: { nodes: [] } },
          }),
          node(4, 'pick', 'flow.switch', {
            cases: [
              { id: ids.node, match: { eq: 'a' }, scope: { nodes: [] } },
              { id: ids.node, match: { in: ['a', 'b'] }, scope: { nodes: [] } },
              { id: ids.node, match: { range: { min: 1, max: 5 } }, scope: { nodes: [] } },
              { id: ids.node, match: { range: { min: 1 } }, scope: { nodes: [] } },
              { id: ids.node, match: { range: { max: 5 } }, scope: { nodes: [] } },
              {
                id: ids.node,
                match: { when: { wire: { from: 'vars', port: 'dim' } } },
                scope: { nodes: [] },
              },
            ],
          }),
          node(5, 'safe', 'flow.try', {
            catches: [
              { id: ids.node, scope: { nodes: [] } },
              { id: ids.node, classes: ['Timeout', 'NotFound'], scope: { nodes: [] } },
            ],
            scopes: { try: { nodes: [node(6, 'quiet', 'device.set', { enabled: false })] } },
          }),
        ],
      },
      onFailure: { nodes: [node(7, 'warn', 'device.set')] },
    };
    expect(outlineOf(nested, CTX).split('\n')).toEqual([
      'when press: When Kitchen switch gets a Single press (off)',
      'only if Quiet (variable)',
      'loop: For each of …',
      '  body:',
      '    inner: Set power of … to …',
      'check: If',
      '  else:',
      '  if Bright (variable):',
      '    inner: Set power of … to …',
      'pick: Switch on …',
      '  case is a:',
      '  case is one of a, b:',
      '  case is between 1 and 5:',
      '  case is at least 1:',
      '  case is at most 5:',
      '  case when Dim (variable):',
      'safe: Try',
      '  try:',
      '    quiet: Set power of … to … (off)',
      '  catch any error:',
      '  catch timeout, not found:',
      'if the run fails:',
      '  warn: Set power of … to …',
    ]);
  });

  it('writes a wired condition and works on functions', () => {
    const odd: AutomationV3 = {
      ...program,
      admit: { lit: true },
      body: {
        nodes: [
          node(1, 'check', 'flow.if', {
            branches: [
              {
                id: ids.node,
                when: { wire: { from: 'cycle', port: 'value' } },
                scope: { nodes: [] },
              },
            ],
          }),
          node(2, 'pick', 'flow.switch', {
            cases: [{ id: ids.node, match: { when: { lit: false } }, scope: { nodes: [] } }],
          }),
        ],
      },
    };
    expect(
      outlineText(
        outlineLines(odd, CTX)
          .slice(1, 4)
          .map((line) => ({ ...line, depth: 0 })),
      ),
    ).toBe('only if yes\ncheck: If\nif Cycle › Value:');
    const lines = outlineLines(functionProgram, CTX);
    expect(lines).toHaveLength(1);
    expect(outlineText(lines)).toBe('send: Set power of Desk lamp to …');
  });

  it('names the data a Custom Node keeps for each use', () => {
    const keeping = {
      ...functionProgram,
      variables: [
        { name: 'count', type: { t: 'number' } as const, initial: { lit: 5 }, persist: true },
        { name: 'scratch', type: { t: 'number' } as const, initial: { lit: 0 } },
      ],
    };
    const lines = outlineLines(keeping, CTX);
    expect(lines[0]).toMatchObject({ kind: 'data', key: null });
    expect(outlineText(lines).split('\n')).toEqual([
      'keeps for each use, between runs: count (number, starts at 5)',
      'send: Set power of Desk lamp to …',
    ]);
  });
});
