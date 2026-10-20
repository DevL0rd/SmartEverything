import { describe, expect, it } from 'vitest';
import type { ObservedValues } from '../lookup';
import { bottleFacts } from './bottle';

function valuesOf(pairs: Readonly<Record<string, string | number | boolean>>): ObservedValues {
  return Object.fromEntries(
    Object.entries(pairs).map(([key, value]) => [
      key,
      { value, observedAt: '2026-10-18T12:00:00Z' },
    ]),
  );
}

describe('bottle visual facts', () => {
  it('shows the water level as a share of the body', () => {
    expect(bottleFacts(valuesOf({ water_level: 62 })).fill).toBe(0.62);
    expect(bottleFacts(valuesOf({ water_level: 140 })).fill).toBe(1);
    expect(bottleFacts({}).fill).toBeNull();
  });

  it('turns the cap state into a light and a UV mode', () => {
    const uv = bottleFacts(valuesOf({ bottle_state: 'uv_adventure' }));
    expect(uv.light).toBe('uv');
    expect(uv.uvMode).toBe('adventure');
    expect(bottleFacts(valuesOf({ bottle_state: 'uv_interlock' })).light).toBe('interlock');
    expect(bottleFacts(valuesOf({ bottle_state: 'fault' })).light).toBe('fault');
    expect(bottleFacts(valuesOf({ bottle_state: 'on' })).light).toBe('off');
  });

  it('tells charging from charged and lets a fault outrank charging', () => {
    expect(bottleFacts(valuesOf({ bottle_charging: 'charging' })).light).toBe('charging');
    expect(bottleFacts(valuesOf({ bottle_charging: 'charged' })).light).toBe('charged');
    expect(
      bottleFacts(valuesOf({ bottle_charging: 'charging', bottle_state: 'fault' })).light,
    ).toBe('fault');
  });

  it('keeps the level trusted unless the hub says it is not', () => {
    expect(bottleFacts({}).reliable).toBe(true);
    expect(bottleFacts(valuesOf({ bottle_reliable: false })).reliable).toBe(false);
  });

  it('notes a sync in progress and the battery', () => {
    const facts = bottleFacts(valuesOf({ bottle_link: 'syncing', battery: 41 }));
    expect(facts.syncing).toBe(true);
    expect(facts.battery).toBe(41);
    expect(facts.tilt).toBe('upright');
  });
});
