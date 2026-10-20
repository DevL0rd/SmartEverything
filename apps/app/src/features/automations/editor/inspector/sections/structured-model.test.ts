import { describe, expect, it } from 'vitest';
import type { FlowNode, StructuredOutput } from '@smarteverything/domain';
import { PROGRAM_V3 } from '@smarteverything/domain';
import { Ids, automation, scope } from '../../../model/canvas/canvas-fixtures';
import {
  STRUCTURED_TYPES,
  addedOutput,
  laneValueSet,
  nextOutputName,
  outputNameProblem,
  removedOutput,
  renamedOutput,
  structuredLanes,
  typeChoiceOf,
  typedOutput,
} from './structured-model';

const ONE: StructuredOutput = { name: 'level', values: { else: { lit: 1 }, main: { lit: 2 } } };

describe('lanes', () => {
  it('lists the named lanes and hides the On error lane', () => {
    const node: FlowNode = {
      ...new Ids().next(),
      kind: 'flow.if',
      scopes: { else: scope([]), onError: scope([]) },
    };
    expect(structuredLanes(node)).toEqual(['else']);
    expect(structuredLanes({ ...node, scopes: undefined })).toEqual([]);
  });
});

describe('output names', () => {
  it('accepts a fresh identifier and the name it already has', () => {
    expect(outputNameProblem([ONE], [], undefined, 'brightness')).toBeUndefined();
    expect(outputNameProblem([ONE], [], 'level', 'level')).toBeUndefined();
  });

  it('refuses an identifier that is not valid or is already used', () => {
    expect(outputNameProblem([ONE], [], undefined, '1st')).toMatch(/lowercase/);
    expect(outputNameProblem([ONE], [], undefined, 'level')).toMatch(/already used/);
    expect(outputNameProblem([ONE], ['status'], undefined, 'status')).toMatch(/already used/);
  });

  it('chooses the next free default name', () => {
    expect(nextOutputName([])).toBe('result1');
    expect(nextOutputName([{ name: 'result2', values: { a: { lit: 1 } } }])).toBe('result3');
    const taken: readonly StructuredOutput[] = [
      { name: 'result2', values: { a: { lit: 1 } } },
      { name: 'result3', values: { a: { lit: 1 } } },
    ];
    expect(nextOutputName(taken)).toBe('result4');
  });
});

describe('editing the list', () => {
  it('adds an output with a value in every lane', () => {
    const next = addedOutput([ONE], ['else', 'main']);
    expect(next).toHaveLength(2);
    expect(next[1]).toEqual({
      name: 'result2',
      values: { else: { lit: null }, main: { lit: null } },
    });
  });

  it('renames, removes and sets the type of one output only', () => {
    const other: StructuredOutput = { name: 'other', values: { else: { lit: 0 } } };
    expect(renamedOutput([ONE, other], 'level', 'power').map((output) => output.name)).toEqual([
      'power',
      'other',
    ]);
    expect(removedOutput([ONE, other], 'level')).toEqual([other]);
    const typed = typedOutput([ONE, other], 'level', 'number');
    expect(typed[0]?.type).toEqual({ t: 'number' });
    expect(typed[1]).toBe(other);
    expect(typedOutput(typed, 'level', 'any')[0]).toEqual(ONE);
  });

  it('reads the type choice back', () => {
    for (const choice of STRUCTURED_TYPES) {
      const output = typedOutput([ONE], 'level', choice.value)[0];
      expect(output === undefined ? '' : typeChoiceOf(output)).toBe(choice.value);
    }
  });

  it('sets one lane and removes it, but never the last value', () => {
    const set = laneValueSet([ONE], 'level', 'else', { lit: 9 });
    expect(set[0]?.values).toEqual({ main: { lit: 2 }, else: { lit: 9 } });
    const removed = laneValueSet([ONE], 'level', 'else', null);
    expect(removed[0]?.values).toEqual({ main: { lit: 2 } });
    const last = laneValueSet(removed, 'level', 'main', null);
    expect(last[0]?.values).toEqual({ main: { lit: 2 } });
  });

  it('produces outputs the program schema accepts', () => {
    const ids = new Ids();
    const node: FlowNode = {
      ...ids.next(),
      kind: 'flow.if',
      branches: [{ id: ids.next().id, when: { lit: true }, scope: scope([]) }],
      scopes: { else: scope([]) },
      outputs: [...addedOutput([], ['else'])],
    };
    expect(PROGRAM_V3.safeParse(automation([node])).success).toBe(true);
  });
});
