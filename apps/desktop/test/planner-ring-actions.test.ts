import { describe, expect, it, vi } from 'vitest';
import { RingActions, type RingActionsHub } from '../src/planner/ring-actions.js';
import type { DesktopRing } from '../src/planner/ring-types.js';

const ALARM = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e01';
const DUE = '2030-01-01T07:00:00.000Z';
const AGAIN = '2030-01-01T07:09:00.000Z';

const alarm: DesktopRing = {
  ringKey: `alarm:${ALARM}`,
  kind: 'alarm',
  refId: ALARM,
  dueAt: DUE,
  label: 'Wake up',
  rampSeconds: 30,
  sound: { kind: 'tone', id: 'default' },
  snoozeLimit: 3,
  snoozes: 0,
  challenge: { kind: 'none' },
};

describe('desktop ring actions', () => {
  it('keeps the first due moment of a snoozed alarm until a dismiss reaches the Hub', async () => {
    const dismiss = vi
      .fn<(ring: DesktopRing, dueAt: string) => Promise<void>>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    const hub: RingActionsHub = {
      snooze: () => Promise.resolve({ until: AGAIN, snoozes: 1 }),
      dismiss,
      elsewhere: () => Promise.resolve({ kind: 'ringing' }),
    };
    const snoozed = vi.fn();
    const settled = vi.fn();
    const actions = new RingActions(hub, { snoozed, settled });
    await actions.snoozed(alarm);
    const again: DesktopRing = { ...alarm, dueAt: AGAIN, snoozes: 1 };
    expect(snoozed).toHaveBeenCalledWith(again);
    await expect(actions.dismissed(again)).rejects.toThrow('offline');
    expect(settled).not.toHaveBeenCalled();
    await actions.dismissed(again);
    expect(dismiss.mock.calls.map(([, dueAt]) => dueAt)).toEqual([DUE, DUE]);
    expect(settled).toHaveBeenCalledOnce();
  });
});
