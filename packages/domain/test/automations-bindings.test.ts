import { describe, expect, it } from 'vitest';
import {
  AUTOMATION_COMMAND_INPUT,
  AUTOMATION_INPUT,
  AutomationBindingError,
  checkedBindingValue,
  resolveAutomationInput,
  resolveCommandInput,
  type AutomationBindingContext,
  type JsonValue,
} from '../src';

const LAMP = '11111111-1111-4111-8111-111111111111';
const VALUE_ID = '3a000000-0000-4000-8000-000000000001';
const CHOICE_ID = '3b000000-0000-4000-8000-000000000001';

function context(overrides: Partial<AutomationBindingContext> = {}): AutomationBindingContext {
  return {
    value: (): JsonValue => 40,
    parameter: (): JsonValue => 12,
    capability: (): JsonValue => 33,
    ...overrides,
  };
}

function input(value: unknown): ReturnType<typeof AUTOMATION_INPUT.parse> {
  return AUTOMATION_INPUT.parse(value);
}

const literal = (kind: string, value: unknown): unknown => ({
  binding: { source: 'literal', kind, value },
});

describe('C13 inputs: literals, Values, parameters and device readings', () => {
  it('resolves a literal as written', () => {
    expect(resolveAutomationInput(input(literal('number', 7)), context())).toBe(7);
  });

  it('asks the context for a Value, a parameter and a device reading with the declared kind', () => {
    const asked: string[] = [];
    const spy = context({
      value: (id, kind) => {
        asked.push(`value ${id} ${kind}`);
        return 40;
      },
      parameter: (name, kind) => {
        asked.push(`parameter ${name} ${kind}`);
        return 12;
      },
      capability: (id, key, kind) => {
        asked.push(`capability ${id} ${key} ${kind}`);
        return 33;
      },
    });
    const results = [
      { source: 'value', kind: 'number', valueId: VALUE_ID },
      { source: 'parameter', kind: 'number', name: 'level' },
      { source: 'capability', kind: 'number', deviceId: LAMP, capability: 'brightness' },
    ].map((binding) => resolveAutomationInput(input({ binding }), spy));
    expect(results).toStrictEqual([40, 12, 33]);
    expect(asked).toStrictEqual([
      `value ${VALUE_ID} number`,
      'parameter level number',
      `capability ${LAMP} brightness number`,
    ]);
  });

  it('adds or subtracts a numeric offset', () => {
    const base = { binding: { source: 'value', kind: 'number', valueId: VALUE_ID } };
    expect(
      resolveAutomationInput(
        input({ ...base, offset: { operation: 'add', amount: 10, unit: 'number' } }),
        context(),
      ),
    ).toBe(50);
    expect(
      resolveAutomationInput(
        input({ ...base, offset: { operation: 'subtract', amount: 15, unit: 'number' } }),
        context(),
      ),
    ).toBe(25);
  });

  it('refuses an offset result outside its minimum and maximum', () => {
    const bounded = (extra: Record<string, number>): unknown => ({
      binding: { source: 'value', kind: 'number', valueId: VALUE_ID },
      offset: { operation: 'add', amount: 100, unit: 'number', ...extra },
    });
    expect(() => resolveAutomationInput(input(bounded({ maximum: 100 })), context())).toThrow(
      'the result exceeds the input bounds',
    );
    expect(() => resolveAutomationInput(input(bounded({ minimum: 200 })), context())).toThrow(
      AutomationBindingError,
    );
    expect(resolveAutomationInput(input(bounded({ maximum: 140 })), context())).toBe(140);
  });

  it('keeps durations in milliseconds and refuses offsets in another unit or on other kinds', () => {
    const duration = (unit: string): unknown => ({
      binding: { source: 'value', kind: 'duration', valueId: VALUE_ID },
      offset: { operation: 'add', amount: 500, unit },
    });
    expect(resolveAutomationInput(input(duration('milliseconds')), context())).toBe(540);
    expect(() => resolveAutomationInput(input(duration('number')), context())).toThrow(
      'numeric offsets need a matching numeric kind and unit',
    );
    expect(() =>
      resolveAutomationInput(
        input({
          binding: { source: 'literal', kind: 'boolean', value: true },
          offset: { operation: 'add', amount: 1, unit: 'number' },
        }),
        context(),
      ),
    ).toThrow(AutomationBindingError);
  });

  it('refuses a resolved value of the wrong kind and names what was received', () => {
    expect(() => resolveAutomationInput(input(literal('number', 'seven')), context())).toThrow(
      'expected number, received string',
    );
    expect(() => checkedBindingValue('duration', -1)).toThrow(AutomationBindingError);
    expect(checkedBindingValue('choice', CHOICE_ID)).toBe(CHOICE_ID);
    expect(() => checkedBindingValue('choice', 'not-an-id')).toThrow(AutomationBindingError);
    expect(checkedBindingValue('string', 'auto')).toBe('auto');
    expect(() => checkedBindingValue('boolean', null)).toThrow('received null');
  });

  it('resolves a command input to one value or to named arguments', () => {
    const value = AUTOMATION_COMMAND_INPUT.parse({
      type: 'value',
      input: literal('number', 5),
    });
    const fields = AUTOMATION_COMMAND_INPUT.parse({
      type: 'fields',
      fields: { times: literal('number', 3), loud: literal('boolean', true) },
    });
    expect(resolveCommandInput(value, context())).toBe(5);
    expect(resolveCommandInput(fields, context())).toStrictEqual({ times: 3, loud: true });
  });

  it('rejects an input with extra keys or an unknown source', () => {
    expect(AUTOMATION_INPUT.safeParse({ binding: { source: 'sky', kind: 'number' } }).success).toBe(
      false,
    );
    expect(
      AUTOMATION_INPUT.safeParse({
        binding: { source: 'literal', kind: 'number', value: 1 },
        extra: true,
      }).success,
    ).toBe(false);
  });
});
