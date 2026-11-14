import { describe, expect, it, vi } from 'vitest';
import type { PlannerPhoneRingSet } from '@smarteverything/domain';
import { RingHub } from '../src/planner/ring-hub.js';
import { desktopRingsOf, RingSync } from '../src/planner/ring-sync.js';
import { DESKTOP_RING_SET, type DesktopRing, type RingClock } from '../src/planner/ring-types.js';

const ALARM = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e01';
const TIMER = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e02';
const NOW = Date.parse('2030-01-01T06:00:00Z');

function set(hash: string, dueAt = '2030-01-01T07:00:00.000Z'): PlannerPhoneRingSet {
  return {
    hash,
    rings: [
      {
        ringKey: `alarm:${ALARM}`,
        kind: 'alarm',
        refId: ALARM,
        dueAt,
        sound: 'chime',
        rampSeconds: 30,
        vibrate: true,
        label: 'Wake',
      },
      {
        ringKey: `timer:${TIMER}`,
        kind: 'timer',
        refId: TIMER,
        dueAt: '2030-01-01T06:10:00.000Z',
        sound: 'chime',
        rampSeconds: 0,
        vibrate: true,
        label: null,
      },
    ],
  };
}

const clock: RingClock = { now: () => new Date(NOW), at: () => () => undefined };

interface FakeHub {
  readonly hub: RingHub;
  readonly reads: ReturnType<typeof vi.fn>;
  readonly acks: ReturnType<typeof vi.fn>;
}

function hubOf(
  sets: PlannerPhoneRingSet[],
  acknowledge: (hash: string) => boolean = () => true,
): FakeHub {
  const queue = [...sets];
  const reads = vi.fn((): Promise<{ clientId: string; set: PlannerPhoneRingSet | undefined }> => {
    const next = queue.length > 1 ? queue.shift() : queue[0];
    return Promise.resolve({ clientId: 'client', set: next });
  });
  const acks = vi.fn((_client: string, hash: string) => Promise.resolve(acknowledge(hash)));
  const hub = new RingHub({
    server: (): Promise<null> => Promise.resolve(null),
    fetch,
  });
  Object.assign(hub, { readSet: reads, acknowledge: acks });
  return { hub, reads, acks };
}

function firstRing(): DesktopRing {
  const [ring] = desktopRingsOf(set('h1'));
  if (ring === undefined) throw new Error('the fixture set has no ring');
  return ring;
}

function lastScheduled(schedule: ReturnType<typeof vi.fn>): readonly DesktopRing[] {
  const call: unknown = schedule.mock.calls.at(-1)?.[0];
  return DESKTOP_RING_SET.parse(call);
}

async function settle(): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, 0));
}

describe('desktop ring sync', () => {
  it('keeps only what the desktop rings from a phone ring set', () => {
    expect(firstRing()).toEqual({
      ringKey: `alarm:${ALARM}`,
      kind: 'alarm',
      refId: ALARM,
      dueAt: '2030-01-01T07:00:00.000Z',
      label: 'Wake',
      rampSeconds: 30,
    });
  });

  it('schedules the set and acknowledges its hash', async () => {
    const schedule = vi.fn();
    const fake = hubOf([set('h1')]);
    new RingSync(fake.hub, { schedule }, clock).request();
    await settle();
    expect(schedule).toHaveBeenCalledOnce();
    expect(lastScheduled(schedule)).toHaveLength(2);
    expect(fake.acks).toHaveBeenCalledWith('client', 'h1');
  });

  it('reads again when the hub says the set changed before the acknowledgement', async () => {
    const schedule = vi.fn();
    const fake = hubOf([set('old'), set('new')], (hash) => hash === 'new');
    new RingSync(fake.hub, { schedule }, clock).request();
    await settle();
    expect(fake.reads).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('rings a snoozed alarm at its snooze time instead of its next set time', async () => {
    const schedule = vi.fn();
    const sync = new RingSync(
      hubOf([set('h1', '2030-01-02T07:00:00.000Z')]).hub,
      { schedule },
      clock,
    );
    sync.request();
    await settle();
    const snoozed: DesktopRing = { ...firstRing(), dueAt: '2030-01-01T06:09:00.000Z' };
    sync.snoozed(snoozed);
    expect(lastScheduled(schedule).filter((ring) => ring.ringKey === snoozed.ringKey)).toEqual([
      snoozed,
    ]);
    sync.settled(snoozed);
    await settle();
    expect(lastScheduled(schedule).find((ring) => ring.ringKey === snoozed.ringKey)?.dueAt).toBe(
      '2030-01-02T07:00:00.000Z',
    );
  });
});
