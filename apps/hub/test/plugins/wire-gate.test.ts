import { describe, expect, it } from 'vitest';
import { WireGate } from '../../src/plugins/builtin/wire-gate';

function gate(): { wire: WireGate; clock: { now: number } } {
  const clock = { now: 0 };
  return { wire: new WireGate(30_000, () => clock.now), clock };
}

describe('wire gate', () => {
  it('does not republish an unchanged value to everyone after the quiet period', () => {
    const { wire, clock } = gate();
    expect(wire.due(false, false, 'a')).toBe('everyone');
    clock.now = 31_000;
    expect(wire.due(false, false, 'a')).toBeNull();
    clock.now = 120_000;
    expect(wire.due(false, false, 'a')).toBeNull();
    expect(wire.due(true, false, 'a')).toBe('viewers');
  });

  it('publishes a changed value to everyone once the quiet period has passed', () => {
    const { wire, clock } = gate();
    expect(wire.due(false, false, 'a')).toBe('everyone');
    clock.now = 10_000;
    expect(wire.due(false, false, 'b')).toBeNull();
    expect(wire.due(true, false, 'b')).toBe('viewers');
    clock.now = 30_000;
    expect(wire.due(false, false, 'b')).toBe('everyone');
    clock.now = 70_000;
    expect(wire.due(false, false, 'b')).toBeNull();
  });

  it('publishes to everyone when forced and counts a direct send as published', () => {
    const { wire, clock } = gate();
    expect(wire.sent('a')).toBe('everyone');
    clock.now = 1_000;
    expect(wire.due(false, true, 'a')).toBe('everyone');
    clock.now = 40_000;
    expect(wire.due(false, false, 'a')).toBeNull();
  });
});
