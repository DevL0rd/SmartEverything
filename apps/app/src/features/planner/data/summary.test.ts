import { QueryClient } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { EntityStore } from '../../../store/entity-store';
import { noticeRouter } from '../../../store/notice-registry';
import { plannerKeys } from '../../../queries/keys';
import { PLANNER_NOTICES } from './notices';
import { incomingRing, clearPlannerRing } from './ring';
import { plannerSummaries, receivePlannerSummary, summaryOf } from './summary';

const ANA = 'a1b2c3d4-0000-4000-8000-000000000001';
const BEN = 'a1b2c3d4-0000-4000-8000-000000000002';
const RING = 'a1b2c3d4-0000-4000-8000-000000000003';
const ALARM = 'a1b2c3d4-0000-4000-8000-000000000004';

function summary(personId: string, missed: number): Parameters<typeof receivePlannerSummary>[0] {
  return {
    type: 'planner_summary',
    personId,
    missed,
    left: 4,
    nextAlarmAt: '2026-11-08T06:30:00.000Z',
    runningTimers: 1,
  };
}

describe('planner summary', () => {
  it('keeps the latest notice for each person', () => {
    receivePlannerSummary(summary(ANA, 2));
    receivePlannerSummary(summary(BEN, 5));
    receivePlannerSummary(summary(ANA, 0));
    expect(summaryOf(plannerSummaries.get(), ANA)?.missed).toBe(0);
    expect(summaryOf(plannerSummaries.get(), BEN)?.missed).toBe(5);
  });

  it('answers nothing for an unknown or missing person', () => {
    expect(summaryOf({}, ANA)).toBeNull();
    expect(summaryOf(plannerSummaries.get(), null)).toBeNull();
  });

  it('does not store the notice type in the summary', () => {
    receivePlannerSummary(summary(ANA, 1));
    expect(Object.keys(summaryOf(plannerSummaries.get(), ANA) ?? {}).sort()).toEqual([
      'left',
      'missed',
      'nextAlarmAt',
      'personId',
      'runningTimers',
    ]);
  });
});

describe('planner notices', () => {
  it('route the summary and the ring notices through the registry', () => {
    const client = new QueryClient();
    client.setQueryData(plannerKeys.rings(ANA, 'a', 'b'), []);
    const route = noticeRouter(PLANNER_NOTICES, { client, store: new EntityStore() });
    expect(route(summary(BEN, 7), true)).toBe(true);
    expect(summaryOf(plannerSummaries.get(), BEN)?.missed).toBe(7);
    expect(
      route(
        {
          type: 'planner_ring',
          ringId: RING,
          kind: 'alarm',
          refId: ALARM,
          dueAt: '2026-11-08T06:30:00.000Z',
        },
        true,
      ),
    ).toBe(true);
    expect(incomingRing.get()?.ringId).toBe(RING);
    expect(client.getQueryState(plannerKeys.rings(ANA, 'a', 'b'))?.isInvalidated).toBe(true);
  });

  it('clears a ring only when it is still the current one', () => {
    clearPlannerRing(ALARM);
    expect(incomingRing.get()?.ringId).toBe(RING);
    clearPlannerRing(RING);
    expect(incomingRing.get()).toBeNull();
  });
});
