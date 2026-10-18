import { describe, expect, it } from 'vitest';
import { NOT_ME_WINDOW_MS, STALE_AFTER_MS, factsOf, weighInsOf } from './weigh-ins';
import { LIVE_KG, NOW, daysAgo, hoursAgo, momentAgo, readingOf } from '../../../store/body-fixture';

function liveSeries(): ReturnType<typeof weighInsOf> {
  return weighInsOf(
    LIVE_KG.map((weight_kg, index) =>
      readingOf({ weight_kg, measured_at: daysAgo(LIVE_KG.length - index) }),
    ),
  );
}

describe('weigh-ins of one person', () => {
  it('flags 204.7 and 10.1 kg of the live series and keeps 87.8 to 89.4', () => {
    const flagged = liveSeries()
      .filter((weighIn) => weighIn.outlier)
      .map((weighIn) => weighIn.kg);
    expect(flagged).toEqual([204.7, 10.1]);
  });

  it('draws the trend without the flagged readings', () => {
    const { trend } = factsOf(liveSeries(), NOW);
    expect(trend.map((point) => point.v)).toEqual([88.8, 88.9, 89.2, 87.8, 89.4, 87.9]);
  });

  it('trusts a reading the person confirmed even when it is far off', () => {
    const weighIns = weighInsOf([
      readingOf({ weight_kg: 88, measured_at: daysAgo(3) }),
      readingOf({ weight_kg: 89, measured_at: daysAgo(2) }),
      readingOf({ weight_kg: 120, measured_at: daysAgo(1), attribution: 'person' }),
    ]);
    expect(weighIns.map((weighIn) => weighIn.outlier)).toEqual([false, false, false]);
  });

  it('orders weigh-ins oldest first whatever the order they arrive in', () => {
    const weighIns = weighInsOf([
      readingOf({ weight_kg: 90, measured_at: daysAgo(1) }),
      readingOf({ weight_kg: 88, measured_at: daysAgo(5) }),
    ]);
    expect(weighIns.map((weighIn) => weighIn.kg)).toEqual([88, 90]);
  });
});

describe('what the card says about the latest weigh-in', () => {
  it('offers Not me for one hour after a weigh-in and not after', () => {
    const fresh = factsOf(
      weighInsOf([readingOf({ weight_kg: 88, measured_at: momentAgo(NOT_ME_WINDOW_MS - 1) })]),
      NOW,
    );
    const old = factsOf(
      weighInsOf([readingOf({ weight_kg: 88, measured_at: momentAgo(NOT_ME_WINDOW_MS) })]),
      NOW,
    );
    expect([fresh.notMe, old.notMe]).toEqual([true, false]);
  });

  it('offers Not me on a flagged reading however old', () => {
    const facts = factsOf(
      weighInsOf([
        readingOf({ weight_kg: 88, measured_at: daysAgo(4) }),
        readingOf({ weight_kg: 204.7, measured_at: daysAgo(3) }),
      ]),
      NOW,
    );
    expect(facts.notMe).toBe(true);
    expect(facts.latestCounted?.kg).toBe(88);
  });

  it('calls a weigh-in stale after 14 days', () => {
    const fact = (ms: number): boolean =>
      factsOf(weighInsOf([readingOf({ weight_kg: 88, measured_at: momentAgo(ms) })]), NOW).stale;
    expect([fact(STALE_AFTER_MS - 1), fact(STALE_AFTER_MS + 1)]).toEqual([false, true]);
  });

  it('measures the week and the month against the earliest counted weigh-in in that span', () => {
    const facts = factsOf(
      weighInsOf([
        readingOf({ weight_kg: 90.5, measured_at: daysAgo(25) }),
        readingOf({ weight_kg: 89.0, measured_at: daysAgo(6) }),
        readingOf({ weight_kg: 88.5, measured_at: daysAgo(3) }),
        readingOf({ weight_kg: 87.9, measured_at: hoursAgo(2) }),
      ]),
      NOW,
    );
    expect(facts.weekDelta).toBe(-1.1);
    expect(facts.monthDelta).toBe(-2.6);
  });

  it('has no delta when there is nothing earlier in the span', () => {
    const facts = factsOf(
      weighInsOf([readingOf({ weight_kg: 88, measured_at: hoursAgo(2) })]),
      NOW,
    );
    expect([facts.weekDelta, facts.monthDelta]).toEqual([null, null]);
  });

  it('has nothing to say without weigh-ins', () => {
    const facts = factsOf([], NOW);
    expect([facts.latest, facts.notMe, facts.stale, facts.trend]).toEqual([null, false, false, []]);
  });
});
