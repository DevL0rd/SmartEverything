import type { FunctionV3 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  addKept,
  keptLines,
  keptNameProblem,
  keptOf,
  removeKept,
  renameKept,
  retypeKept,
  setStart,
  startProblem,
} from './kept-model';

const PROGRAM: FunctionV3 = {
  version: 3,
  kind: 'function',
  flavour: 'action',
  inputs: [],
  outputs: [],
  exits: ['done'],
  variables: [{ name: 'scratch', type: { t: 'number' }, initial: { lit: 0 } }],
  body: { nodes: [] },
};

describe('data a Custom Node keeps', () => {
  it('adds kept data with a fresh name and lists only kept data', () => {
    const added = addKept(PROGRAM);
    expect(keptOf(added).map((variable) => variable.name)).toEqual(['data2']);
    expect(keptLines(added)).toEqual([
      {
        name: 'data2',
        title: 'data2',
        typeText: 'Number',
        requirement: 'Starts at 0',
        description: null,
      },
    ]);
    expect(added.variables[0]?.persist).toBeUndefined();
  });

  it('renames, retypes and removes only the named data', () => {
    const added = addKept(PROGRAM);
    const renamed = renameKept(added, 'data2', 'count');
    expect(keptNameProblem(renamed, 'count', 'scratch')).toBe('That name is already used.');
    const retyped = retypeKept(renamed, 'count', 'text');
    expect(keptOf(retyped)[0]).toMatchObject({ type: { t: 'text' }, initial: { lit: '' } });
    expect(keptOf(removeKept(retyped, 'count'))).toEqual([]);
    expect(removeKept(retyped, 'count').variables).toHaveLength(1);
  });

  it('checks and sets the start value by kind', () => {
    const kept = keptOf(addKept(PROGRAM))[0];
    if (kept === undefined) throw new Error('no kept data');
    expect(startProblem(kept, 'abc')).toBe('Use a value of this kind.');
    expect(startProblem(kept, '7')).toBeUndefined();
    expect(keptOf(setStart(addKept(PROGRAM), kept, '7'))[0]?.initial).toEqual({ lit: 7 });
  });
});
