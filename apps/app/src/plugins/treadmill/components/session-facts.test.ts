import { SESSION_DETAIL, type SessionDetail } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { factGroupsOf, type FactGroup } from './session-facts';

function detailOf(over: Record<string, unknown>): SessionDetail {
  return SESSION_DETAIL.parse({
    session: {
      id: 's1',
      deviceId: 'd',
      walkerProfileId: null,
      startedAt: '2026-10-18T16:05:00.000Z',
      endedAt: '2026-10-18T16:37:00.000Z',
      zoneOffsetSeconds: 0,
      activeSeconds: 600,
      pausedSeconds: 0,
      distanceM: 1000,
      steps: null,
      kcal: 182,
      kcalNet: null,
      avgKmh: 4,
      maxKmh: 5,
      mode: 'manual',
      kind: 'walk',
      zones: { walk: 600, jog: 0, run: 0 },
      splits: [],
      source: 'live',
      kcalSource: 'belt',
      kcalEstimate: 171,
      ...over,
    },
    profile: [],
    segments: [],
    cadence: null,
    strideM: null,
    met: null,
    paceSecondsPerKm: null,
  });
}

function energy(over: Record<string, unknown>): FactGroup | undefined {
  return factGroupsOf(detailOf(over), 'unconfirmed').find((group) => group.title === 'Energy');
}

describe('session energy facts', () => {
  it('shows the belt figure against the estimate', () => {
    const facts = energy({})?.facts ?? [];
    expect(facts.map((fact) => [fact.label, fact.value])).toEqual([
      ['Belt', '182 kcal'],
      ['Estimate', '171 kcal'],
    ]);
  });

  it('shows one energy figure when the belt gave none', () => {
    const facts = energy({ kcalSource: 'estimate', kcal: 171 })?.facts ?? [];
    expect(facts.map((fact) => fact.label)).toEqual(['Energy']);
  });
});
