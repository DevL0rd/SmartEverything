import { describe, expect, it } from 'vitest';
import { CATCH_CLASSES, toggledClass } from './class-chips-model';

describe('error class chips', () => {
  it('adds a class that is off and removes one that is on', () => {
    expect(toggledClass(['Timeout'], 'Refused')).toEqual(['Timeout', 'Refused']);
    expect(toggledClass(['Timeout', 'Refused'], 'Timeout')).toEqual(['Refused']);
  });

  it('names each catchable class once', () => {
    const values = CATCH_CLASSES.map((entry) => entry.value);
    expect(new Set(values).size).toBe(values.length);
  });
});
