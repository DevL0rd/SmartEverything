import { describe, expect, it } from 'vitest';
import { batteryStateOf } from '../../src/node/collectors/linux/battery';

describe('batteryStateOf', () => {
  it('maps the kernel status words', () => {
    expect(batteryStateOf('Charging\n')).toBe('charging');
    expect(batteryStateOf('Discharging')).toBe('discharging');
    expect(batteryStateOf('Full')).toBe('full');
    expect(batteryStateOf('Not charging')).toBe('idle');
    expect(batteryStateOf('Unknown')).toBe('unknown');
    expect(batteryStateOf('')).toBe('unknown');
  });
});
