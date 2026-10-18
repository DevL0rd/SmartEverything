import { describe, expect, it } from 'vitest';
import type { StepV2 } from '@smarteverything/domain';
import {
  ELSE_SLOT,
  blockChoices,
  duplicateStep,
  editBlock,
  findStep,
  isFlowStep,
  moveStep,
  moveToBlock,
  removeStep,
  replaceStep,
  trailTo,
} from './steps';

const A = '40000000-0000-4000-8000-00000000000a';
const B = '40000000-0000-4000-8000-00000000000b';
const C = '40000000-0000-4000-8000-00000000000c';
const IF = '40000000-0000-4000-8000-0000000000f1';
const CASE = '40000000-0000-4000-8000-0000000000c1';
const LOOP = '40000000-0000-4000-8000-0000000000f2';

const a: StepV2 = { do: 'wait', id: A, ms: 1000 };
const b: StepV2 = { do: 'notify', id: B, message: 'B' };
const c: StepV2 = { do: 'notify', id: C, message: 'C' };
const branching: StepV2 = {
  do: 'if',
  id: IF,
  branches: [{ id: CASE, when: { all: [] }, then: [b] }],
  else: [c],
};
const looping: StepV2 = { do: 'repeat', id: LOOP, times: 2, steps: [a] };

describe('editing the step tree', () => {
  it('replaces a step wherever it sits and leaves the rest as the same objects', () => {
    const next: StepV2 = { ...b, message: 'changed' };
    const result = replaceStep([a, branching], next);
    const inner = result[1];
    expect(inner?.do === 'if' && inner.branches[0]?.then[0]).toEqual(next);
    expect(result[0]).toBe(a);
  });

  it('keeps the tree identity when nothing matches, so memoised views stay stable', () => {
    const tree = [a, branching];
    expect(removeStep(tree, 'missing')).toBe(tree);
    expect(replaceStep(tree, { ...a, id: 'missing' })).toBe(tree);
  });

  it('removes a nested step', () => {
    const result = removeStep([branching], B);
    const only = result[0];
    expect(only?.do === 'if' && only.branches[0]?.then).toEqual([]);
  });

  it('moves a step earlier or later within its own block only', () => {
    expect(moveStep([a, b, c], B, -1).map((step) => step.id)).toEqual([B, A, C]);
    expect(moveStep([a, b, c], A, -1).map((step) => step.id)).toEqual([A, B, C]);
    const inner: StepV2 = { do: 'repeat', id: LOOP, times: 2, steps: [b, c] };
    const moved = moveStep([a, inner], C, -1);
    const loop = moved[1];
    expect(loop?.do === 'repeat' && loop.steps.map((step) => step.id)).toEqual([C, B]);
  });

  it('duplicates a step with fresh identities, also inside blocks', () => {
    let next = 0;
    const fresh = (): string => `50000000-0000-4000-8000-${String((next += 1)).padStart(12, '0')}`;
    const result = duplicateStep([branching], IF, fresh);
    expect(result).toHaveLength(2);
    const copy = result[1];
    expect(copy?.id).not.toBe(IF);
    expect(copy?.do === 'if' && copy.branches[0]?.id).not.toBe(CASE);
    expect(copy?.do === 'if' && copy.branches[0]?.then[0]?.id).not.toBe(B);
  });

  it('adds to a branch, the otherwise block and a repeat body by address', () => {
    const added: StepV2 = { do: 'wait', id: A, ms: 1 };
    const inCase = editBlock([branching], { owner: IF, slot: CASE }, (block) => [...block, added]);
    const ifStep = inCase[0];
    expect(ifStep?.do === 'if' && ifStep.branches[0]?.then).toHaveLength(2);
    const inElse = editBlock([branching], { owner: IF, slot: ELSE_SLOT }, () => []);
    expect(inElse[0]?.do === 'if' && inElse[0].else).toEqual([]);
    const inLoop = editBlock([looping], { owner: LOOP, slot: 'body' }, (block) => [...block, b]);
    expect(inLoop[0]?.do === 'repeat' && inLoop[0].steps).toHaveLength(2);
  });

  it('moves a step into another block and refuses to move it into itself', () => {
    const moved = moveToBlock([a, branching], A, { owner: IF, slot: ELSE_SLOT, index: 0 });
    expect(moved).toHaveLength(1);
    const ifStep = moved[0];
    expect(ifStep?.do === 'if' && ifStep.else?.map((step) => step.id)).toEqual([A, C]);
    const tree = [looping];
    expect(moveToBlock(tree, LOOP, { owner: LOOP, slot: 'body', index: 0 })).toBe(tree);
  });

  it('lists the blocks a step can move to without its own subtree', () => {
    const choices = blockChoices([a, branching, looping], IF);
    expect(choices.map((choice) => choice.label)).toEqual(['Then', 'Then › Repeat › Steps']);
  });

  it('finds the path to a nested step for the breadcrumb', () => {
    const trail = trailTo([branching], C);
    expect(trail?.map((entry) => [entry.step.id, entry.slot])).toEqual([
      [IF, ELSE_SLOT],
      [C, 'root'],
    ]);
    expect(trailTo([branching], 'missing')).toBeNull();
    expect(findStep([branching], B)?.id).toBe(B);
  });

  it('tells steps that hold other steps or values from plain ones', () => {
    expect(isFlowStep(branching)).toBe(true);
    expect(isFlowStep(a)).toBe(false);
  });
});
