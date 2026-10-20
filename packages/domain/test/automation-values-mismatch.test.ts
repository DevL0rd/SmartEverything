import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_CHOICE_ID,
  AUTOMATION_VALUE_CONTENT,
  AutomationValueError,
  applyAutomationValueOperation,
  type AutomationValueContent,
} from '../src/automation-values';

const A = AUTOMATION_CHOICE_ID.parse('3b000000-0000-4000-8000-000000000001');

const BOOLEAN: AutomationValueContent = AUTOMATION_VALUE_CONTENT.parse({
  kind: 'boolean',
  name: 'Flag',
  value: false,
});
const NUMBER: AutomationValueContent = AUTOMATION_VALUE_CONTENT.parse({
  kind: 'number',
  name: 'Level',
  value: 1,
  bounds: { overflow: 'clamp' },
});
const DURATION: AutomationValueContent = AUTOMATION_VALUE_CONTENT.parse({
  kind: 'duration',
  name: 'Wait',
  value: 5,
  bounds: {},
});
const CHOICE: AutomationValueContent = AUTOMATION_VALUE_CONTENT.parse({
  kind: 'choice',
  name: 'Scene',
  value: A,
  choices: [{ id: A, label: 'One' }],
});

describe('an operation for the wrong kind of Value', () => {
  it('is refused for a number or duration given a boolean or choice operation', () => {
    expect(() =>
      applyAutomationValueOperation(NUMBER, { kind: 'boolean', operation: { type: 'toggle' } }),
    ).toThrow('operation kind boolean does not match number');
    expect(() =>
      applyAutomationValueOperation(DURATION, { kind: 'choice', operation: { type: 'next' } }),
    ).toThrow('operation kind choice does not match duration');
  });

  it('is refused for a number given a duration operation', () => {
    expect(() =>
      applyAutomationValueOperation(NUMBER, {
        kind: 'duration',
        operation: { type: 'set', value: 1 },
      }),
    ).toThrow(AutomationValueError);
  });

  it('is refused for a boolean or choice given another kind', () => {
    expect(() =>
      applyAutomationValueOperation(BOOLEAN, {
        kind: 'number',
        operation: { type: 'set', value: 1 },
      }),
    ).toThrow('operation kind number does not match boolean');
    expect(() =>
      applyAutomationValueOperation(CHOICE, { kind: 'boolean', operation: { type: 'toggle' } }),
    ).toThrow('operation kind boolean does not match choice');
  });
});

describe('a number pushed past what a number can hold', () => {
  it('is refused as not finite', () => {
    const huge = AUTOMATION_VALUE_CONTENT.parse({
      kind: 'number',
      name: 'Huge',
      value: Number.MAX_VALUE,
      bounds: { overflow: 'clamp' },
    });
    expect(() =>
      applyAutomationValueOperation(huge, {
        kind: 'number',
        operation: { type: 'add', value: Number.MAX_VALUE },
      }),
    ).toThrow('numbers must be finite');
  });
});

describe('a number with a step and limits that clamp', () => {
  const stepped = AUTOMATION_VALUE_CONTENT.parse({
    kind: 'number',
    name: 'Level',
    value: 1,
    bounds: { minimum: 0, maximum: 10, quantum: 0.5, overflow: 'clamp' },
  });

  it('moves in whole steps and stops at the limit', () => {
    const up = applyAutomationValueOperation(stepped, {
      kind: 'number',
      operation: { type: 'add', value: 1.5 },
    });
    expect(up.value).toBe(2.5);
    const past = applyAutomationValueOperation(stepped, {
      kind: 'number',
      operation: { type: 'add', value: 100 },
    });
    expect(past.value).toBe(10);
  });

  it('refuses a change that falls between steps', () => {
    expect(() =>
      applyAutomationValueOperation(stepped, {
        kind: 'number',
        operation: { type: 'add', value: 0.3 },
      }),
    ).toThrow('the value and range must align to a safe integral quantum');
  });
});

describe('a number with a step and only an upper limit', () => {
  it('counts its steps from zero', () => {
    const open = AUTOMATION_VALUE_CONTENT.parse({
      kind: 'number',
      name: 'Level',
      value: 2,
      bounds: { maximum: 10, quantum: 1, overflow: 'clamp' },
    });
    expect(
      applyAutomationValueOperation(open, { kind: 'number', operation: { type: 'add', value: 3 } })
        .value,
    ).toBe(5);
    expect(() =>
      applyAutomationValueOperation(open, {
        kind: 'number',
        operation: { type: 'add', value: 0.5 },
      }),
    ).toThrow('the value and range must align to a safe integral quantum');
  });
});
