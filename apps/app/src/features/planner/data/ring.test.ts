import {
  PLANNER_RING_ROW,
  type PlannerRingNotice,
  type PlannerRingRow,
} from '@smarteverything/domain';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  dueWindowOf,
  openRingWhenRinging,
  ringOpens,
  ringPhaseOf,
  shownRing,
  type RingOpener,
} from './ring';

const PROFILE = 'a1b2c3d4-0000-4000-8000-000000000001';
const RING = 'a1b2c3d4-0000-4000-8000-000000000002';
const ALARM = 'a1b2c3d4-0000-4000-8000-000000000003';
const DUE = '2026-11-08T06:00:00.000Z';
const NOW = Date.parse('2026-11-08T06:00:05.000Z');

const NOTICE: PlannerRingNotice = {
  type: 'planner_ring',
  ringId: RING,
  kind: 'alarm',
  refId: ALARM,
  dueAt: DUE,
};

function ring(overrides: Partial<PlannerRingRow> = {}): PlannerRingRow {
  return PLANNER_RING_ROW.parse({
    id: RING,
    kind: 'alarm',
    ref_id: ALARM,
    profile_id: PROFILE,
    due_at: DUE,
    rang_at: DUE,
    dismissed_at: null,
    snoozes: 0,
    target: null,
    outcome: 'rang',
    missed_reason: null,
    ...overrides,
  });
}

function opener(rows: readonly PlannerRingRow[], foreground = true): RingOpener {
  return {
    foreground: () => foreground,
    rings: vi.fn(() => Promise.resolve(rows)),
    now: () => NOW,
    open: vi.fn(),
  };
}

afterEach(() => {
  shownRing.set(null);
});

describe('ring phase', () => {
  it('rings until it is stopped, and waits while snoozed', () => {
    expect(ringPhaseOf(ring(), NOW)).toEqual({ kind: 'ringing' });
    expect(ringPhaseOf(ring({ dismissed_at: DUE }), NOW)).toEqual({ kind: 'stopped' });
    expect(ringPhaseOf(ring({ rang_at: '2026-11-08T06:09:00.000Z', snoozes: 1 }), NOW)).toEqual({
      kind: 'snoozed',
      until: '2026-11-08T06:09:00.000Z',
    });
  });

  it('looks the ring up by its exact due moment', () => {
    expect(dueWindowOf(DUE)).toEqual({ from: DUE, to: '2026-11-08T06:00:00.001Z' });
  });
});

describe('ring notice navigation', () => {
  const base = { notice: NOTICE, ring: ring(), now: NOW, foreground: true, shown: null };

  it('opens the ring screen for a ringing alarm or timer in the foreground', () => {
    expect(ringOpens(base)).toBe(true);
    expect(ringOpens({ ...base, ring: ring({ kind: 'timer' }) })).toBe(true);
  });

  it('stays put in the background, when already shown, or when the ring is not ringing', () => {
    expect(ringOpens({ ...base, foreground: false })).toBe(false);
    expect(ringOpens({ ...base, shown: RING })).toBe(false);
    expect(ringOpens({ ...base, ring: null })).toBe(false);
    expect(ringOpens({ ...base, ring: ring({ dismissed_at: DUE }) })).toBe(false);
    expect(
      ringOpens({ ...base, ring: ring({ rang_at: '2026-11-08T06:09:00.000Z', snoozes: 1 }) }),
    ).toBe(false);
    expect(ringOpens({ ...base, ring: ring({ kind: 'reminder', dismissed_at: DUE }) })).toBe(false);
  });

  it('reads the ring at its due moment and opens it', async () => {
    const open = opener([ring()]);
    await expect(openRingWhenRinging(NOTICE, open)).resolves.toBe(true);
    expect(open.rings).toHaveBeenCalledWith(dueWindowOf(DUE));
    expect(open.open).toHaveBeenCalledWith(RING);
  });

  it('does not ask the hub for a reminder or in the background', async () => {
    const reminder = opener([ring()]);
    await expect(openRingWhenRinging({ ...NOTICE, kind: 'reminder' }, reminder)).resolves.toBe(
      false,
    );
    const hidden = opener([ring()], false);
    await expect(openRingWhenRinging(NOTICE, hidden)).resolves.toBe(false);
    expect(reminder.rings).not.toHaveBeenCalled();
    expect(hidden.rings).not.toHaveBeenCalled();
  });

  it('does not reopen the screen that already shows the ring', async () => {
    shownRing.set(RING);
    const open = opener([ring()]);
    await expect(openRingWhenRinging(NOTICE, open)).resolves.toBe(false);
    expect(open.open).not.toHaveBeenCalled();
  });
});
