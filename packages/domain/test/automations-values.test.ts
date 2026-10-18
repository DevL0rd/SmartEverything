import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_CHOICE_ID,
  AUTOMATION_VALUE_CONTENT,
  AutomationValueError,
  applyAutomationValueOperation,
  validateAutomationValue,
  type AutomationValueContent,
  type AutomationValueOperation,
} from '../src';

const A = AUTOMATION_CHOICE_ID.parse('3b000000-0000-4000-8000-000000000001');
const B = AUTOMATION_CHOICE_ID.parse('3b000000-0000-4000-8000-000000000002');
const C = AUTOMATION_CHOICE_ID.parse('3b000000-0000-4000-8000-000000000003');

function numberValue(
  value: number,
  bounds: Partial<Extract<AutomationValueContent, { kind: 'number' }>['bounds']> = {},
): AutomationValueContent {
  return AUTOMATION_VALUE_CONTENT.parse({
    kind: 'number',
    name: 'Level',
    value,
    bounds: { overflow: 'reject', ...bounds },
  });
}

function choiceValue(value: typeof A, overflow: 'clamp' | 'wrap'): AutomationValueContent {
  return AUTOMATION_VALUE_CONTENT.parse({
    kind: 'choice',
    name: 'Scene',
    value,
    choices: [
      { id: A, label: 'One' },
      { id: B, label: 'Two' },
      { id: C, label: 'Three' },
    ],
    overflow,
  });
}

function add(amount: number): AutomationValueOperation {
  return { kind: 'number', operation: { type: 'add', value: amount } };
}

function valueOf(content: AutomationValueContent): unknown {
  return content.value;
}

describe('C23 Value operations', () => {
  it('sets and toggles a boolean Value', () => {
    const flag = AUTOMATION_VALUE_CONTENT.parse({
      kind: 'boolean',
      name: 'Guest mode',
      value: false,
    });
    const toggled = applyAutomationValueOperation(flag, {
      kind: 'boolean',
      operation: { type: 'toggle' },
    });
    expect(valueOf(toggled)).toBe(true);
    expect(
      valueOf(
        applyAutomationValueOperation(toggled, {
          kind: 'boolean',
          operation: { type: 'set', value: false },
        }),
      ),
    ).toBe(false);
  });

  it('sets, adds to and subtracts from a number Value', () => {
    const level = numberValue(10);
    const set = applyAutomationValueOperation(level, {
      kind: 'number',
      operation: { type: 'set', value: 4 },
    });
    const added = applyAutomationValueOperation(set, add(3));
    const subtracted = applyAutomationValueOperation(added, {
      kind: 'number',
      operation: { type: 'subtract', value: 1 },
    });
    expect([valueOf(set), valueOf(added), valueOf(subtracted)]).toStrictEqual([4, 7, 6]);
  });

  it('rejects a result outside the bounds and names the problem', () => {
    const level = numberValue(8, { minimum: 0, maximum: 10 });
    expect(() => applyAutomationValueOperation(level, add(5))).toThrow(
      'the result is outside the configured bounds',
    );
    expect(() => applyAutomationValueOperation(level, add(5))).toThrow(AutomationValueError);
  });

  it('clamps to the nearest bound when overflow is clamp', () => {
    const level = numberValue(8, { minimum: 0, maximum: 10, overflow: 'clamp' });
    expect(valueOf(applyAutomationValueOperation(level, add(5)))).toBe(10);
    expect(
      valueOf(
        applyAutomationValueOperation(level, {
          kind: 'number',
          operation: { type: 'subtract', value: 50 },
        }),
      ),
    ).toBe(0);
  });

  it('wraps around the range in steps of the quantum when overflow is wrap', () => {
    const level = numberValue(9, { minimum: 0, maximum: 10, quantum: 1, overflow: 'wrap' });
    expect(valueOf(applyAutomationValueOperation(level, add(3)))).toBe(1);
    expect(
      valueOf(
        applyAutomationValueOperation(
          numberValue(0, { minimum: 0, maximum: 10, quantum: 1, overflow: 'wrap' }),
          {
            kind: 'number',
            operation: { type: 'subtract', value: 1 },
          },
        ),
      ),
    ).toBe(10);
  });

  it('refuses wrap without increasing bounds and a quantum', () => {
    expect(() =>
      applyAutomationValueOperation(
        numberValue(1, { minimum: 0, maximum: 10, overflow: 'wrap' }),
        add(1),
      ),
    ).toThrow('wrap requires increasing bounds and a positive quantum');
  });

  it('keeps a Value aligned to its quantum and refuses a step that falls between two', () => {
    const level = numberValue(0, { minimum: 0, maximum: 10, quantum: 2 });
    expect(valueOf(applyAutomationValueOperation(level, add(4)))).toBe(4);
    expect(() => applyAutomationValueOperation(level, add(3))).toThrow(
      'align to a safe integral quantum',
    );
  });

  it('keeps a duration non-negative and refuses a negative bound', () => {
    const wait = AUTOMATION_VALUE_CONTENT.parse({
      kind: 'duration',
      name: 'Wait',
      value: 1000,
      bounds: { overflow: 'reject' },
    });
    expect(() =>
      applyAutomationValueOperation(wait, {
        kind: 'duration',
        operation: { type: 'subtract', value: 2000 },
      }),
    ).toThrow(AutomationValueError);
    expect(() =>
      validateAutomationValue({
        kind: 'duration',
        name: 'Wait',
        value: 0,
        bounds: { overflow: 'reject', minimum: -1 },
      }),
    ).toThrow('duration bounds must be nonnegative milliseconds');
  });

  it('moves a choice Value to the next and previous choice, clamping or wrapping at the ends', () => {
    const wrapped = choiceValue(C, 'wrap');
    expect(
      valueOf(
        applyAutomationValueOperation(wrapped, { kind: 'choice', operation: { type: 'next' } }),
      ),
    ).toBe(A);
    expect(
      valueOf(
        applyAutomationValueOperation(choiceValue(A, 'wrap'), {
          kind: 'choice',
          operation: { type: 'previous' },
        }),
      ),
    ).toBe(C);
    const clamped = choiceValue(C, 'clamp');
    expect(
      valueOf(
        applyAutomationValueOperation(clamped, { kind: 'choice', operation: { type: 'next' } }),
      ),
    ).toBe(C);
  });

  it('sets a choice only to one of its own choices', () => {
    const mode = choiceValue(A, 'clamp');
    expect(
      valueOf(
        applyAutomationValueOperation(mode, {
          kind: 'choice',
          operation: { type: 'set', value: B },
        }),
      ),
    ).toBe(B);
    expect(() =>
      applyAutomationValueOperation(mode, {
        kind: 'choice',
        operation: {
          type: 'set',
          value: AUTOMATION_CHOICE_ID.parse('3b000000-0000-4000-8000-0000000000ff'),
        },
      }),
    ).toThrow('the selected choice does not exist');
  });

  it('refuses an operation of another kind than the Value', () => {
    expect(() =>
      applyAutomationValueOperation(numberValue(1), {
        kind: 'boolean',
        operation: { type: 'toggle' },
      }),
    ).toThrow('operation kind boolean does not match number');
  });

  it('refuses a Value whose minimum exceeds its maximum or whose choices repeat', () => {
    expect(() => validateAutomationValue(numberValue(1, { minimum: 5, maximum: 1 }))).toThrow(
      'minimum must not exceed maximum',
    );
    expect(() =>
      validateAutomationValue({
        kind: 'choice',
        name: 'Scene',
        value: A,
        choices: [
          { id: A, label: 'One' },
          { id: A, label: 'Again' },
        ],
        overflow: 'clamp',
      }),
    ).toThrow('choice identities must be unique');
  });

  it('keeps every wrapped number inside its range and on its quantum', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: -50, max: 50 }),
        fc.integer({ min: 1, max: 5 }),
        fc.integer({ min: 1, max: 20 }),
        (delta, quantum, ticks) => {
          const minimum = 0;
          const maximum = quantum * ticks;
          const level = numberValue(0, { minimum, maximum, quantum, overflow: 'wrap' });
          const next = applyAutomationValueOperation(level, add(Math.abs(delta) * quantum));
          const result = Number(valueOf(next));
          expect(result).toBeGreaterThanOrEqual(minimum);
          expect(result).toBeLessThanOrEqual(maximum);
          expect(result % quantum).toBe(0);
        },
      ),
    );
  });

  it('never leaves the bounds when clamping, whatever the step', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 100 }),
        fc.integer({ min: 0, max: 1000 }),
        (start, amount) => {
          const level = numberValue(start, { minimum: 0, maximum: 100, overflow: 'clamp' });
          const result = Number(valueOf(applyAutomationValueOperation(level, add(amount))));
          expect(result).toBeGreaterThanOrEqual(0);
          expect(result).toBeLessThanOrEqual(100);
        },
      ),
    );
  });
});
