import { describe, expect, it } from 'vitest';
import { TIME_ZONE } from '../src/automations';
import {
  AUTOMATION_VALUE_CONTENT,
  AutomationValueError,
  validateAutomationValue,
} from '../src/automation-values';
import { knownResponseStrings } from '../src/api/primitives';
import { z } from 'zod';

describe('time zones', () => {
  it('refuses a name with no region and a region the system does not know', () => {
    expect(TIME_ZONE.safeParse('Mars').success).toBe(false);
    expect(TIME_ZONE.safeParse('Mars/Olympus').success).toBe(false);
  });
});

describe('Value limits', () => {
  it('keeps a number as it is when it has bounds but no step', () => {
    const content = AUTOMATION_VALUE_CONTENT.parse({
      kind: 'number',
      name: 'Level',
      value: 3,
      bounds: { minimum: 0, maximum: 5, overflow: 'reject' },
    });
    expect(validateAutomationValue(content)).toStrictEqual(content);
  });

  it('refuses a starting number that the limits would move', () => {
    const content = AUTOMATION_VALUE_CONTENT.parse({
      kind: 'number',
      name: 'Level',
      value: 9,
      bounds: { minimum: 0, maximum: 5, overflow: 'clamp' },
    });
    expect(() => validateAutomationValue(content)).toThrow(AutomationValueError);
    expect(() => validateAutomationValue(content)).toThrow(
      'the initial value must be within bounds',
    );
  });

  it('refuses a wrapping range with more steps than a number can count', () => {
    const content = AUTOMATION_VALUE_CONTENT.parse({
      kind: 'number',
      name: 'Counter',
      value: 0,
      bounds: { minimum: 0, maximum: Number.MAX_SAFE_INTEGER, quantum: 1, overflow: 'wrap' },
    });
    expect(() => validateAutomationValue(content)).toThrow(
      'wrap range exceeds safe integral ticks',
    );
  });
});

describe('knownResponseStrings', () => {
  it('keeps the strings it knows and drops the rest instead of failing', () => {
    const colours = knownResponseStrings(z.enum(['red', 'green']));
    expect(colours.parse(['red', 'blue', 'green'])).toStrictEqual(['red', 'green']);
    expect(colours.parse([])).toStrictEqual([]);
  });
});
