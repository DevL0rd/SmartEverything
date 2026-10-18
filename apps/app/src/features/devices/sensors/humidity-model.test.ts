import { describe, expect, it } from 'vitest';
import { humidityShare, humidityStateText, targetTick } from './humidity-model';

describe('humidifier ring', () => {
  it('turns a percentage into a share inside the ring', () => {
    expect(humidityShare(40)).toBe(0.4);
    expect(humidityShare(140)).toBe(1);
    expect(humidityShare(-5)).toBe(0);
  });

  it('centres the target tick on the target angle', () => {
    expect(targetTick(50)).toEqual({ start: 177.5, sweep: 5 });
  });

  it('words humidity against the target only while it runs', () => {
    expect(humidityStateText(40, 55, 'on')).toBe('40 % humidity · target 55 %');
    expect(humidityStateText(40, 55, 'off')).toBe('Off · 40 % humidity');
    expect(humidityStateText(null, 55, 'off')).toBe('Off');
    expect(humidityStateText(null, null, 'on')).toBe('Waiting for the first reading');
    expect(humidityStateText(40, 55, 'offline')).toBe('40 % humidity');
    expect(humidityStateText(null, 55, 'offline')).toBe('No reading yet');
  });
});
