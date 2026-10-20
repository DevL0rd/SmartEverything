import type { FunctionV3 } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import type { Program } from '../../src/program/walk';
import { MIN_SAME_STEPS, findSameSteps } from '../../src/functions/same-steps';
import {
  automation,
  branching,
  wired,
  extracted,
  lit,
  node,
  probe,
  withPress,
} from '../extract/support';

function calleeOf(first: string, second: string): FunctionV3 {
  const program = withPress(
    automation([
      probe('first', { label: wired(first) }),
      probe('second', { count: wired(second) }),
      probe('third'),
    ]),
  );
  return extracted(program, ['first', 'second']).callee;
}

function candidate(id: string, program: Program): { id: string; name: string; program: Program } {
  return { id, name: `Automation ${id}`, program };
}

const CALLEE = calleeOf('trigger.subject', 'first.out');

describe('findSameSteps', () => {
  it('finds the same steps with other keys, other inputs and other steps around them', () => {
    const other = automation([
      probe('before'),
      probe('lamp', { label: wired('trigger.other') }),
      probe('lamp2', { count: wired('lamp.out') }),
      probe('after'),
    ]);
    const matches = findSameSteps(CALLEE, [candidate('a', other)]);
    expect(matches).toHaveLength(1);
    expect(matches[0]?.id).toBe('a');
    expect(matches[0]?.keys).toEqual(['lamp', 'lamp2']);
    expect(matches[0]?.scope).toEqual({ t: 'root', root: 'body' });
    expect(matches[0]?.nodeIds).toHaveLength(2);
  });

  it('accepts a fixed value where the reusable node takes an input', () => {
    const room = automation([
      probe('first', { label: lit('kitchen') }),
      probe('second', { count: wired('first.out') }),
    ]);
    expect(findSameSteps(CALLEE, [candidate('a', room)])).toHaveLength(1);
  });

  it('refuses other kinds, other fixed values, other order and other wiring', () => {
    const wrongKind = automation([node('first', 'math.add'), probe('second')]);
    const wrongFixed = automation([
      probe('first', { label: wired('trigger.subject'), need: lit('y') }),
      probe('second', { count: wired('first.out') }),
    ]);
    const swapped = automation([
      probe('second', { count: wired('trigger.n') }),
      probe('first', { label: wired('trigger.subject') }),
    ]);
    const unwired = automation([
      probe('first', { label: wired('trigger.subject') }),
      probe('second', { count: lit(3) }),
    ]);
    const all = [wrongKind, wrongFixed, swapped, unwired].map((program, index) =>
      candidate(String(index), program),
    );
    expect(findSameSteps(CALLEE, all)).toEqual([]);
  });

  it('needs one input to be given the same value everywhere it is used', () => {
    const twice = calleeOf('trigger.subject', 'trigger.subject');
    const same = automation([
      probe('first', { label: wired('trigger.a') }),
      probe('second', { count: wired('trigger.a') }),
    ]);
    const different = automation([
      probe('first', { label: wired('trigger.a') }),
      probe('second', { count: wired('trigger.b') }),
    ]);
    expect(twice.inputs).toHaveLength(1);
    expect(findSameSteps(twice, [candidate('same', same)])).toHaveLength(1);
    expect(findSameSteps(twice, [candidate('different', different)])).toEqual([]);
  });

  it('finds steps inside a branch and matches each repeat once', () => {
    const inside = automation([
      branching('cond', [
        probe('first', { label: wired('trigger.subject') }),
        probe('second', { count: wired('first.out') }),
      ]),
      probe('x', { label: wired('trigger.subject') }),
      probe('y', { count: wired('x.out') }),
      probe('z', { label: wired('trigger.subject') }),
      probe('w', { count: wired('z.out') }),
    ]);
    const matches = findSameSteps(CALLEE, [candidate('a', inside)]);
    expect(matches.map((match) => match.keys)).toEqual([
      ['x', 'y'],
      ['z', 'w'],
      ['first', 'second'],
    ]);
    expect(matches[2]?.scope.t).toBe('child');
  });

  it('matches steps that contain a nested scope with the same structure', () => {
    const nested = withPress(
      automation([
        branching('cond', [probe('inner', { label: wired('trigger.subject') })]),
        probe('after', { count: wired('trigger.subject') }),
        probe('tail'),
      ]),
    );
    const callee = extracted(nested, ['cond', 'after']).callee;
    const same = automation([
      branching('check', [probe('act', { label: wired('trigger.z') })]),
      probe('then', { count: wired('trigger.z') }),
    ]);
    const emptier = automation([
      branching('check', []),
      probe('then', { count: wired('trigger.z') }),
    ]);
    expect(findSameSteps(callee, [candidate('same', same)])).toHaveLength(1);
    expect(findSameSteps(callee, [candidate('emptier', emptier)])).toEqual([]);
  });

  it('offers nothing for a single step', () => {
    const single = extracted(withPress(automation([probe('only'), probe('next')])), ['only']);
    expect(MIN_SAME_STEPS).toBe(2);
    expect(findSameSteps(single.callee, [candidate('a', automation([probe('only')]))])).toEqual([]);
  });
});
