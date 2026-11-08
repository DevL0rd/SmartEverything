import { STATIC_KIND_LOOKUP } from '@smarteverything/domain';
import { applyPatch } from '@smarteverything/flow/graph/ops/reducer';
import type { GraphNode, ProgramV4 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import {
  automation,
  decisionProgram,
  earlyEndProgram,
  idOf,
  note,
  start,
  switchProgram,
  tryProgram,
} from '../../../model/graph/graph-scene-fixtures';
import {
  addBranchOps,
  addCaseOps,
  addCatchOps,
  addEachCaseOps,
  branchTitle,
  canFailAgain,
  canRemoveRow,
  caseTitle,
  catchTitle,
  classesOps,
  everyCaseOps,
  failAgainOps,
  matchOps,
  moveRowOps,
  removeRowOps,
  rowKindOf,
  runsEveryCase,
  whenOps,
} from './graph-row-model';

function nodeOf(program: ProgramV4, key: string): GraphNode {
  const found = program.nodes.find((node) => node.key === key);
  if (found === undefined) throw new Error(`no node ${key}`);
  return found;
}

function applied(program: ProgramV4, ops: Parameters<typeof applyPatch>[1]): ProgramV4 {
  const result = applyPatch(program, ops, {
    kinds: STATIC_KIND_LOOKUP,
    newId: () => crypto.randomUUID(),
    allowProblems: true,
  });
  if (!result.ok) throw new Error(result.reason);
  return result.program;
}

describe('titles and kinds', () => {
  it('names rows by position', () => {
    expect([branchTitle(0), branchTitle(2), caseTitle(0), catchTitle(1)]).toEqual([
      'If',
      'Otherwise if',
      'Case 1',
      'Catch 2',
    ]);
    expect(rowKindOf(nodeOf(decisionProgram(), 'check'))).toBe('branch');
    expect(rowKindOf(nodeOf(switchProgram(), 'mode'))).toBe('case');
    expect(rowKindOf(nodeOf(tryProgram(), 'guarded'))).toBe('catch');
    expect(rowKindOf(nodeOf(decisionProgram(), 'lamp'))).toBeUndefined();
  });

  it('keeps one branch on an If', () => {
    const program = decisionProgram();
    expect(canRemoveRow(nodeOf(program, 'check'), 'branch')).toBe(false);
    expect(canRemoveRow(nodeOf(program, 'check'), 'case')).toBe(true);
  });
});

function branchesOf(program: ProgramV4): GraphNode['branches'] {
  return nodeOf(program, 'check').branches;
}

describe('If branches', () => {
  it('adds an unwired true branch', () => {
    const added = applied(decisionProgram(), addBranchOps('check'));
    expect(branchesOf(added)).toHaveLength(2);
    expect(branchesOf(added)?.[1]).toMatchObject({ when: { lit: true } });
    expect(branchesOf(added)?.[1]?.to).toBeUndefined();
  });

  it('edits, moves and removes a branch without touching wires', () => {
    const added = applied(decisionProgram(), addBranchOps('check'));
    const second = branchesOf(added)?.[1]?.id ?? '';
    const edited = applied(added, whenOps('check', second, { lit: false }));
    expect(branchesOf(edited)?.[1]?.when).toEqual({ lit: false });
    const moved = applied(edited, moveRowOps('check', 'branch', second, 0));
    expect(branchesOf(moved)?.[0]?.id).toBe(second);
    const removed = applied(moved, removeRowOps('check', 'branch', second));
    expect(branchesOf(removed)).toHaveLength(1);
    expect(branchesOf(removed)?.[0]?.to).toBe('lamp');
  });
});

describe('Switch cases', () => {
  it('adds a case, changes its match and adds one case per option', () => {
    const program = switchProgram();
    const added = applied(program, addCaseOps('mode', { eq: '' }));
    expect(nodeOf(added, 'mode').cases).toHaveLength(3);
    const id = nodeOf(added, 'mode').cases?.[2]?.id ?? '';
    const matched = applied(added, matchOps('mode', id, { in: ['x', 'y'] }));
    expect(nodeOf(matched, 'mode').cases?.[2]?.match).toEqual({ in: ['x', 'y'] });
    const many = applied(matched, addEachCaseOps('mode', ['one', 'two']));
    expect(nodeOf(many, 'mode').cases?.map((row) => row.match)).toContainEqual({ eq: 'two' });
    expect(nodeOf(many, 'mode').cases).toHaveLength(5);
  });

  it('switches the run-every-case mode on and off', () => {
    const program = switchProgram();
    expect(runsEveryCase(nodeOf(program, 'mode'))).toBe(false);
    const on = applied(program, everyCaseOps('mode', true));
    expect(runsEveryCase(nodeOf(on, 'mode'))).toBe(true);
    const off = applied(on, everyCaseOps('mode', false));
    expect(runsEveryCase(nodeOf(off, 'mode'))).toBe(false);
    expect(nodeOf(off, 'mode').ports?.['mode']).toBeUndefined();
  });
});

describe('Try catches', () => {
  it('adds a catch, sets its kinds and clears them with an empty list', () => {
    const program = tryProgram();
    const added = applied(program, addCatchOps('guarded'));
    expect(nodeOf(added, 'guarded').catches).toHaveLength(2);
    const id = nodeOf(added, 'guarded').catches?.[1]?.id ?? '';
    const typed = applied(added, classesOps('guarded', id, ['Timeout', 'Unreachable']));
    expect(nodeOf(typed, 'guarded').catches?.[1]?.classes).toEqual(['Timeout', 'Unreachable']);
    const cleared = applied(typed, classesOps('guarded', id, []));
    expect(nodeOf(cleared, 'guarded').catches?.[1]?.classes).toBeUndefined();
    const removed = applied(cleared, removeRowOps('guarded', 'catch', id));
    expect(nodeOf(removed, 'guarded').catches).toHaveLength(1);
  });

  it('does not offer Fail again on a catch that already goes somewhere', () => {
    const program = tryProgram();
    expect(canFailAgain(nodeOf(program, 'guarded'), idOf('guarded:oops'))).toBe(false);
  });

  it('adds Fail again after a catch that goes nowhere yet', () => {
    const oops = idOf('guarded:oops');
    const open = automation([
      start('guarded'),
      { ...nodeOf(tryProgram(), 'guarded'), catches: [{ id: oops }], to: { try: 'risky' } },
      note('risky'),
    ]);
    expect(canFailAgain(nodeOf(open, 'guarded'), oops)).toBe(true);
    const next = applied(open, failAgainOps('guarded', oops));
    const fail = next.nodes.find((node) => node.kind === 'flow.fail');
    expect(fail?.ports?.['cause']).toEqual({ wire: { from: 'guarded', port: 'error' } });
    expect(nodeOf(next, 'guarded').catches?.[0]?.to).toBe(fail?.key);
  });
});

describe('unwired rows', () => {
  it('leaves a new If row unwired so the Otherwise stays as it was', () => {
    const program = earlyEndProgram();
    const added = applied(program, addBranchOps('check'));
    const check = nodeOf(added, 'check');
    expect(check.to).toBeUndefined();
    expect(check.branches?.map((row) => row.to)).toEqual(['lamp', undefined]);
  });
});
