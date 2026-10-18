import { describe, expect, it } from 'vitest';
import { masterControlOf } from './master-focus';

describe('the master control a focus request names', () => {
  it('maps the capability keys search links carry to the control that drives them', () => {
    expect(masterControlOf('brightness')).toBe('level');
    expect(masterControlOf('color_temperature')).toBe('white');
    expect(masterControlOf('color')).toBe('colour');
  });

  it('names no control for power, anything else, or no request', () => {
    expect(masterControlOf('power')).toBeNull();
    expect(masterControlOf('toString')).toBeNull();
    expect(masterControlOf(null)).toBeNull();
  });
});
