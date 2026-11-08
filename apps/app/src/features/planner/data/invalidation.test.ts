import { QueryClient } from '@tanstack/react-query';
import type { LiveChange, LiveTable } from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';
import { plannerKeys, type PlannerKind } from '../../../queries/keys';

vi.mock('../../home-map/data/live', () => ({ applyHomeMapChanges: vi.fn() }));

const { applyToWindows, plannerKindsChanged } = await import('../../../queries/live-invalidations');

const PERSON = 'a1b2c3d4-0000-4000-8000-000000000001';
const FIRST = '2026-11-02T00:00:00.000Z';
const LAST = '2026-11-08T23:59:59.000Z';

function deletion(table: 'planner_items' | 'planner_alarms' | 'google_accounts'): LiveChange {
  return { type: 'change', table, operation: 'DELETE', record: null, oldRecord: null, seq: 1 };
}

function seeded(): QueryClient {
  const client = new QueryClient();
  client.setQueryData(plannerKeys.day(PERSON, '2026-11-07'), { seeded: true });
  client.setQueryData(plannerKeys.range(PERSON, FIRST, LAST, null), { seeded: true });
  client.setQueryData(plannerKeys.stats(PERSON, 'week'), { seeded: true });
  client.setQueryData(plannerKeys.rings(PERSON, FIRST, LAST), { seeded: true });
  client.setQueryData(plannerKeys.preferences(PERSON), { seeded: true });
  return client;
}

function stale(client: QueryClient): readonly PlannerKind[] {
  const kinds: readonly PlannerKind[] = ['day', 'range', 'stats', 'rings'];
  return kinds.filter((kind) =>
    client
      .getQueryCache()
      .findAll({ queryKey: plannerKeys.prefix(kind) })
      .every((query) => query.state.isInvalidated),
  );
}

describe('planner live invalidation', () => {
  it('refetches day, range and stats when an item changes', () => {
    const client = seeded();
    applyToWindows(client, [deletion('planner_items')]);
    expect(stale(client)).toEqual(['day', 'range', 'stats']);
  });

  it('refetches day, stats and rings when an alarm changes, never the range', () => {
    const client = seeded();
    applyToWindows(client, [deletion('planner_alarms')]);
    expect(stale(client)).toEqual(['day', 'stats', 'rings']);
  });

  it('refetches day and range when the Google account changes', () => {
    const client = seeded();
    applyToWindows(client, [deletion('google_accounts')]);
    expect(stale(client)).toEqual(['day', 'range']);
  });

  it('leaves the planner queries alone for other tables', () => {
    const client = seeded();
    const other: readonly LiveTable[] = ['rooms', 'devices'];
    expect(plannerKindsChanged(new Set(other))).toEqual([]);
    expect(stale(client)).toEqual([]);
  });

  it('never touches the preferences query', () => {
    const client = seeded();
    applyToWindows(client, [deletion('planner_items'), deletion('planner_alarms')]);
    expect(client.getQueryState(plannerKeys.preferences(PERSON))?.isInvalidated).toBe(false);
  });
});
