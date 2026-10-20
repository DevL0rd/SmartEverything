import { describe, expect, it } from 'vitest';
import type { FunctionInterface } from '../../src/functions/interface-hash';
import { classifyInterfaceChange } from '../../src/functions/compat';
import type { ChangeCode, Compatibility } from '../../src/functions/compat';
import { NUMBER, TEXT } from './support';

const INTEGER = { t: 'number', integer: true } as const;

const before: FunctionInterface = {
  flavour: 'action',
  inputs: [
    { name: 'step', type: NUMBER, required: true },
    { name: 'room', type: TEXT, required: false },
  ],
  outputs: [{ name: 'level', type: NUMBER }],
  exits: ['done', 'failed'],
};

function codes(
  after: FunctionInterface,
  old: FunctionInterface = before,
): { result: Compatibility; codes: ChangeCode[] } {
  const result = classifyInterfaceChange(old, after);
  return { result: result.result, codes: result.changes.map((entry) => entry.code) };
}

function only(
  code: ChangeCode,
  result: Compatibility,
  after: FunctionInterface,
  old = before,
): void {
  const outcome = codes(after, old);
  expect(outcome.codes).toEqual([code]);
  expect(outcome.result).toBe(result);
}

describe('classifyInterfaceChange', () => {
  it('calls an identical interface compatible with no changes', () => {
    expect(classifyInterfaceChange(before, structuredClone(before))).toEqual({
      result: 'compatible',
      changes: [],
    });
  });

  it('treats zero inputs, zero outputs and zero exits as valid on both sides', () => {
    const empty: FunctionInterface = { inputs: [], outputs: [], exits: [] };
    expect(classifyInterfaceChange(empty, empty).result).toBe('compatible');
    only(
      'input-added',
      'compatible',
      { ...empty, inputs: [{ name: 'a', type: TEXT, required: false }] },
      empty,
    );
    only('output-added', 'compatible', { ...empty, outputs: [{ name: 'a', type: TEXT }] }, empty);
    only('exit-added', 'compatible', { ...empty, exits: ['done'] }, empty);
    only('input-removed', 'breaking', empty, {
      ...empty,
      inputs: [{ name: 'a', type: TEXT, required: false }],
    });
    only('output-removed', 'breaking', empty, { ...empty, outputs: [{ name: 'a', type: TEXT }] });
    only('exit-removed', 'breaking', empty, { ...empty, exits: ['done'] });
  });

  it('classifies inputs', () => {
    const [step, room] = before.inputs;
    if (step === undefined || room === undefined) throw new Error('fixture');
    only('input-added', 'compatible', {
      ...before,
      inputs: [step, room, { name: 'x', type: TEXT, required: false }],
    });
    only('input-added', 'compatible', {
      ...before,
      inputs: [step, room, { name: 'x', type: TEXT, required: true, default: 'a' }],
    });
    only('input-added-required', 'breaking', {
      ...before,
      inputs: [step, room, { name: 'x', type: TEXT, required: true }],
    });
    only('input-removed', 'breaking', { ...before, inputs: [step] });
    only('input-made-required', 'breaking', {
      ...before,
      inputs: [step, { ...room, required: true }],
    });
    only('input-made-optional', 'compatible', {
      ...before,
      inputs: [{ ...step, required: false }, room],
    });
    only('input-type-narrowed', 'breaking', {
      ...before,
      inputs: [{ ...step, type: INTEGER }, room],
    });
    only('input-type-narrowed', 'breaking', { ...before, inputs: [{ ...step, type: TEXT }, room] });
    only(
      'input-type-widened',
      'compatible',
      { ...before, inputs: [step, room] },
      { ...before, inputs: [{ ...step, type: INTEGER }, room] },
    );
    only('input-default-changed', 'compatible', {
      ...before,
      inputs: [step, { ...room, default: 'kitchen' }],
    });
    only('label-changed', 'compatible', { ...before, inputs: [{ ...step, label: 'Step' }, room] });
    only('description-changed', 'compatible', {
      ...before,
      inputs: [{ ...step, description: 'How far' }, room],
    });
  });

  it('calls a renamed input breaking through the removal', () => {
    const [step, room] = before.inputs;
    if (step === undefined || room === undefined) throw new Error('fixture');
    const outcome = codes({ ...before, inputs: [{ ...step, name: 'amount' }, room] });
    expect(outcome.result).toBe('breaking');
    expect(outcome.codes).toEqual(['input-removed', 'input-added-required']);
  });

  it('classifies outputs', () => {
    const level = { name: 'level', type: NUMBER };
    only('output-added', 'compatible', {
      ...before,
      outputs: [level, { name: 'extra', type: TEXT }],
    });
    only('output-removed', 'breaking', { ...before, outputs: [] });
    only('output-made-optional', 'breaking', {
      ...before,
      outputs: [{ ...level, optional: true }],
    });
    only(
      'output-made-required',
      'compatible',
      { ...before, outputs: [level] },
      { ...before, outputs: [{ ...level, optional: true }] },
    );
    only('output-type-widened', 'breaking', { ...before, outputs: [{ ...level, type: TEXT }] });
    only('output-type-narrowed', 'compatible', {
      ...before,
      outputs: [{ ...level, type: INTEGER }],
    });
    only('label-changed', 'compatible', { ...before, outputs: [{ ...level, label: 'Level' }] });
  });

  it('classifies exits and flavour', () => {
    only('exit-added', 'compatible', { ...before, exits: ['done', 'failed', 'late'] });
    only('exit-removed', 'breaking', { ...before, exits: ['done'] });
    only('flavour-changed', 'breaking', { ...before, flavour: 'pure' });
    const { flavour: omitted, ...rest } = before;
    expect(omitted).toBe('action');
    expect(codes(rest).codes).toEqual([]);
    expect(codes(before, rest).codes).toEqual([]);
  });

  it('is breaking when any one change is breaking and gives a reason for each', () => {
    const [step, room] = before.inputs;
    if (step === undefined || room === undefined) throw new Error('fixture');
    const result = classifyInterfaceChange(before, {
      ...before,
      inputs: [step, { ...room, label: 'Room' }],
      exits: ['done'],
    });
    expect(result.result).toBe('breaking');
    expect(result.changes).toHaveLength(2);
    expect(result.changes.every((entry) => entry.reason.length > 0)).toBe(true);
    expect(result.changes.map((entry) => [entry.part, entry.name, entry.compat])).toEqual([
      ['input', 'room', 'compatible'],
      ['exit', 'failed', 'breaking'],
    ]);
  });
});
