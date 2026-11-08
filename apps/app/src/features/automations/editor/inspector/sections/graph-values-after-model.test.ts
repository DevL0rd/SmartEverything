import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { applyPatch } from '@smarteverything/flow/graph/ops/reducer';
import {
  NODE_REGISTRY,
  type GraphNode,
  type ProgramV4,
  type StructuredOutput,
} from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  decisionProgram,
  forkProgram,
  switchProgram,
  tryProgram,
} from '../../../model/graph/graph-scene-fixtures';
import {
  addedOutput,
  afterName,
  hasValuesAfter,
  laneValueSet,
  nextOutputName,
  outputNameProblem,
  outputsOps,
  removedOutput,
  renamedOutput,
  reservedOutputNames,
  typeChoiceOf,
  typedOutput,
  valueLanesOf,
} from './graph-values-after-model';

function nodeOf(program: ProgramV4, key: string): GraphNode {
  const found = program.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no node ${key}`);
  return found;
}

function only(outputs: readonly StructuredOutput[]): StructuredOutput {
  const [first] = outputs;
  if (first === undefined) throw new Error('no output');
  return first;
}

describe('valueLanesOf', () => {
  it('has only Otherwise for an If because a row id is not a scope name', () => {
    const program = decisionProgram();
    expect(valueLanesOf(nodeOf(program, 'check'), NODE_REGISTRY)).toEqual([
      { lane: 'else', label: 'Otherwise' },
    ]);
  });

  it('has only Default for a Switch', () => {
    const program = switchProgram();
    expect(valueLanesOf(nodeOf(program, 'mode'), NODE_REGISTRY)).toEqual([
      { lane: 'default', label: 'Default' },
    ]);
  });

  it('has Try and Finally for a Try but no catch rows and no Then', () => {
    const program = tryProgram();
    expect(valueLanesOf(nodeOf(program, 'guarded'), NODE_REGISTRY)).toEqual([
      { lane: 'try', label: 'Try' },
      { lane: 'finally', label: 'Finally' },
    ]);
  });

  it('has one lane per path for a Do together', () => {
    const program = forkProgram('all');
    expect(valueLanesOf(nodeOf(program, 'both'), NODE_REGISTRY)).toEqual([
      { lane: 'left', label: 'left' },
      { lane: 'right', label: 'right' },
    ]);
  });
});

describe('kinds', () => {
  it('limits the section to the four owners', () => {
    const program = decisionProgram();
    expect(hasValuesAfter(nodeOf(program, 'check'))).toBe(true);
    expect(hasValuesAfter(nodeOf(program, 'lamp'))).toBe(false);
    expect(afterName('flow.if')).toBe('after the If');
  });

  it('reserves the declared output names', () => {
    expect(reservedOutputNames(nodeOf(forkProgram('all'), 'both'), NODE_REGISTRY)).toEqual([
      'status',
    ]);
  });
});

describe('output edits', () => {
  const lanes = [
    { lane: 'a', label: 'If' },
    { lane: 'else', label: 'Otherwise' },
  ];

  it('adds one empty value per lane and names it result1', () => {
    const [added] = addedOutput([], lanes);
    expect(added).toEqual({ name: 'result1', values: { a: { lit: null }, else: { lit: null } } });
    expect(nextOutputName(addedOutput([], lanes))).toBe('result2');
  });

  it('renames, types, sets and removes', () => {
    const base = addedOutput([], lanes);
    const renamed = renamedOutput(base, 'result1', 'level');
    expect(renamed[0]?.name).toBe('level');
    const typed = typedOutput(renamed, 'level', 'number');
    expect(typed[0]?.type).toEqual({ t: 'number' });
    expect(typeChoiceOf(only(typed))).toBe('number');
    expect(typeChoiceOf(only(typedOutput(typed, 'level', 'any')))).toBe('any');
    const set = laneValueSet(typed, 'level', 'a', { lit: 5 });
    expect(set[0]?.values['a']).toEqual({ lit: 5 });
    const cleared = laneValueSet(set, 'level', 'a', null);
    expect(Object.keys(cleared[0]?.values ?? {})).toEqual(['else']);
    expect(removedOutput(cleared, 'level')).toEqual([]);
  });

  it('keeps the last value of an output instead of emptying it', () => {
    const one = [{ name: 'x', values: { a: { lit: 1 } } }] satisfies StructuredOutput[];
    expect(laneValueSet(one, 'x', 'a', null)).toEqual(one);
  });

  it('checks output names', () => {
    const outputs = addedOutput([], lanes);
    expect(outputNameProblem(outputs, ['status'], undefined, 'result1')).toBe(
      'That name is already used.',
    );
    expect(outputNameProblem(outputs, ['status'], undefined, 'status')).toBe(
      'That name is already used.',
    );
    expect(outputNameProblem(outputs, [], undefined, 'Bad')).toMatch(/Use letters/);
    expect(outputNameProblem(outputs, [], 'result1', 'result1')).toBeUndefined();
    expect(outputNameProblem(outputs, [], undefined, 'fresh')).toBeUndefined();
  });
});

describe('outputsOps', () => {
  it('writes the outputs of a decision through the set op and clears them with null', () => {
    const program = decisionProgram();
    const check = nodeOf(program, 'check');
    const outputs = addedOutput([], valueLanesOf(check, NODE_REGISTRY));
    const result = applyPatch(program, outputsOps('check', outputs), {
      kinds: STATIC_KIND_LOOKUP,
      newId: () => crypto.randomUUID(),
      allowProblems: true,
    });
    if (!result.ok) throw new Error(result.reason);
    expect(nodeOf(result.program, 'check').outputs).toEqual(outputs);
    const cleared = applyPatch(result.program, outputsOps('check', []), {
      kinds: STATIC_KIND_LOOKUP,
      newId: () => crypto.randomUUID(),
      allowProblems: true,
    });
    if (!cleared.ok) throw new Error(cleared.reason);
    expect(nodeOf(cleared.program, 'check').outputs).toBeUndefined();
  });
});
