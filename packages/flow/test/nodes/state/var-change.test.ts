import { describe, expect, it } from 'vitest';
import { AUTOMATION_CHOICE_ID } from '@smarteverything/domain';
import type { AutomationValueContent } from '@smarteverything/domain';
import { changeHomeValue, changeVariable } from '../../../src/nodes/state/var-change';

const STEPS = [0, 1, 2, 3, 4, 5];

describe('changeVariable', () => {
  it('toggles a flag and rejects other values', () => {
    expect(changeVariable(true, { op: 'toggle' })).toStrictEqual({
      ok: true,
      value: false,
      previous: true,
      wrapped: false,
    });
    expect(changeVariable(1, { op: 'toggle' })).toMatchObject({
      ok: false,
      errorClass: 'TypeError',
    });
  });

  it('adds, subtracts and multiplies numbers', () => {
    expect(changeVariable(5, { op: 'add', amount: 2 })).toMatchObject({ value: 7, previous: 5 });
    expect(changeVariable(5, { op: 'subtract', amount: 7 })).toMatchObject({ value: -2 });
    expect(changeVariable(5, { op: 'multiply', amount: 3 })).toMatchObject({ value: 15 });
  });

  it('rejects arithmetic on the wrong type, without an amount, or past infinity', () => {
    expect(changeVariable('a', { op: 'add', amount: 1 })).toMatchObject({
      errorClass: 'TypeError',
    });
    expect(changeVariable(1, { op: 'add' })).toMatchObject({ errorClass: 'Invalid' });
    expect(changeVariable(1, { op: 'add', amount: 'x' })).toMatchObject({ errorClass: 'Invalid' });
    expect(changeVariable(Number.MAX_VALUE, { op: 'multiply', amount: 10 })).toMatchObject({
      errorClass: 'MathError',
    });
  });

  it('steps forward and back, wrapping by default', () => {
    expect(changeVariable(2, { op: 'next', steps: STEPS })).toMatchObject({
      value: 3,
      wrapped: false,
    });
    expect(changeVariable(5, { op: 'next', steps: STEPS })).toMatchObject({
      value: 0,
      wrapped: true,
    });
    expect(changeVariable(0, { op: 'previous', steps: STEPS })).toMatchObject({
      value: 5,
      wrapped: true,
    });
    expect(changeVariable(3, { op: 'previous', steps: STEPS })).toMatchObject({ value: 2 });
  });

  it('stops at the end when clamping', () => {
    expect(changeVariable(5, { op: 'next', steps: STEPS, edge: 'clamp' })).toMatchObject({
      value: 5,
      wrapped: false,
    });
    expect(changeVariable(0, { op: 'previous', steps: STEPS, edge: 'clamp' })).toMatchObject({
      value: 0,
      wrapped: false,
    });
  });

  it('needs steps that contain the current value', () => {
    expect(changeVariable(1, { op: 'next' })).toMatchObject({ errorClass: 'Invalid' });
    expect(changeVariable(9, { op: 'next', steps: STEPS })).toMatchObject({
      errorClass: 'NotFound',
    });
    expect(changeVariable({ a: 1 }, { op: 'next', steps: [{ a: 1 }, { a: 2 }] })).toMatchObject({
      value: { a: 2 },
    });
  });

  it('appends to and removes from a list', () => {
    expect(changeVariable([1], { op: 'append', amount: 2 })).toMatchObject({ value: [1, 2] });
    expect(changeVariable([1, 2, 1], { op: 'remove', amount: 1 })).toMatchObject({ value: [2, 1] });
    expect(changeVariable([1], { op: 'remove', amount: 9 })).toMatchObject({
      errorClass: 'NotFound',
    });
    expect(changeVariable([1], { op: 'append' })).toMatchObject({ errorClass: 'Invalid' });
    expect(changeVariable('x', { op: 'append', amount: 1 })).toMatchObject({
      errorClass: 'TypeError',
    });
  });

  it('sets a field of a record', () => {
    expect(changeVariable({ a: 1 }, { op: 'set_field', field: 'b', amount: 2 })).toMatchObject({
      value: { a: 1, b: 2 },
      previous: { a: 1 },
    });
    expect(changeVariable([1], { op: 'set_field', field: 'b', amount: 2 })).toMatchObject({
      errorClass: 'TypeError',
    });
    expect(changeVariable(null, { op: 'set_field', field: 'b', amount: 2 })).toMatchObject({
      errorClass: 'TypeError',
    });
    expect(changeVariable({}, { op: 'set_field', amount: 2 })).toMatchObject({
      errorClass: 'Invalid',
    });
    expect(changeVariable({}, { op: 'set_field', field: '', amount: 2 })).toMatchObject({
      errorClass: 'Invalid',
    });
    expect(changeVariable({}, { op: 'set_field', field: 'b' })).toMatchObject({
      errorClass: 'Invalid',
    });
  });

  it('fails on a variable without a value', () => {
    expect(changeVariable(undefined, { op: 'toggle' })).toMatchObject({ errorClass: 'NotFound' });
  });
});

const A = AUTOMATION_CHOICE_ID.parse('11111111-1111-4111-8111-111111111111');
const B = AUTOMATION_CHOICE_ID.parse('22222222-2222-4222-8222-222222222222');

function number(value: number, bounds: object): AutomationValueContent {
  return { kind: 'number', name: 'Level', value, bounds: { overflow: 'reject', ...bounds } };
}

describe('changeHomeValue', () => {
  it('toggles a boolean Value', () => {
    const content: AutomationValueContent = { kind: 'boolean', name: 'Away', value: false };
    expect(changeHomeValue(content, { op: 'toggle' })).toMatchObject({
      ok: true,
      value: true,
      previous: false,
      content: { value: true },
    });
  });

  it('adds, subtracts and multiplies inside the bounds', () => {
    const content = number(5, { minimum: 0, maximum: 10 });
    expect(changeHomeValue(content, { op: 'add', amount: 2 })).toMatchObject({ value: 7 });
    expect(changeHomeValue(content, { op: 'subtract', amount: 2 })).toMatchObject({ value: 3 });
    expect(changeHomeValue(content, { op: 'multiply', amount: 2 })).toMatchObject({ value: 10 });
    const duration: AutomationValueContent = {
      kind: 'duration',
      name: 'Wait',
      value: 1000,
      bounds: { overflow: 'reject' },
    };
    expect(changeHomeValue(duration, { op: 'add', amount: 500 })).toMatchObject({ value: 1500 });
  });

  it('keeps the V2 overflow messages for a rejected change', () => {
    const content = number(9, { minimum: 0, maximum: 10 });
    expect(changeHomeValue(content, { op: 'add', amount: 2 })).toStrictEqual({
      ok: false,
      errorClass: 'Invalid',
      message: 'Invalid automation Value: the result is outside the configured bounds',
    });
  });

  it('clamps and wraps numbers by the Value overflow rule', () => {
    expect(
      changeHomeValue(number(9, { minimum: 0, maximum: 10, overflow: 'clamp' }), {
        op: 'add',
        amount: 5,
      }),
    ).toMatchObject({ value: 10 });
    const wrapping = number(10, { minimum: 0, maximum: 10, quantum: 1, overflow: 'wrap' });
    expect(changeHomeValue(wrapping, { op: 'add', amount: 1 })).toMatchObject({ value: 0 });
    expect(
      changeHomeValue(number(1, { overflow: 'wrap' }), { op: 'add', amount: 1 }),
    ).toMatchObject({
      message: 'Invalid automation Value: wrap requires increasing bounds and a positive quantum',
    });
  });

  it('steps a choice Value and reports wrapping', () => {
    const choice = (value: typeof A, overflow: 'wrap' | 'clamp'): AutomationValueContent => ({
      kind: 'choice',
      name: 'Mode',
      value,
      overflow,
      choices: [
        { id: A, label: 'Auto' },
        { id: B, label: 'Boost' },
      ],
    });
    expect(changeHomeValue(choice(A, 'wrap'), { op: 'next' })).toMatchObject({
      value: B,
      wrapped: false,
    });
    expect(changeHomeValue(choice(B, 'wrap'), { op: 'next' })).toMatchObject({
      value: A,
      wrapped: true,
    });
    expect(changeHomeValue(choice(A, 'wrap'), { op: 'previous' })).toMatchObject({
      value: B,
      wrapped: true,
    });
    expect(changeHomeValue(choice(B, 'wrap'), { op: 'previous' })).toMatchObject({
      value: A,
      wrapped: false,
    });
    expect(changeHomeValue(choice(B, 'clamp'), { op: 'next' })).toMatchObject({
      value: B,
      wrapped: false,
    });
  });

  it('rejects operations a Value kind does not support', () => {
    const flag: AutomationValueContent = { kind: 'boolean', name: 'Away', value: false };
    expect(changeHomeValue(flag, { op: 'add', amount: 1 })).toMatchObject({
      errorClass: 'TypeError',
    });
    expect(changeHomeValue(number(1, {}), { op: 'append', amount: 1 })).toMatchObject({
      errorClass: 'TypeError',
    });
    expect(changeHomeValue(number(1, {}), { op: 'next' })).toMatchObject({
      errorClass: 'TypeError',
    });
  });

  it('adds a negative amount as a subtraction', () => {
    expect(changeHomeValue(number(5, {}), { op: 'add', amount: -2 })).toMatchObject({ value: 3 });
    expect(changeHomeValue(number(5, {}), { op: 'subtract', amount: -2 })).toMatchObject({
      value: 7,
    });
  });

  it('rejects a Value arithmetic change without a number', () => {
    expect(changeHomeValue(number(1, {}), { op: 'add', amount: 'x' })).toMatchObject({
      errorClass: 'Invalid',
    });
  });

  it('does not hide a Value that fails its own schema', () => {
    const broken: AutomationValueContent = { kind: 'boolean', name: '', value: false };
    expect(() => changeHomeValue(broken, { op: 'toggle' })).toThrow();
  });
});
