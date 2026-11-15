import { describe, expect, it, vi } from 'vitest';
import type { PlannerPhoneRingSet } from '@smarteverything/domain';
import { RingHub } from '../src/planner/ring-hub.js';
import { desktopRingsOf, RingSync, type RingRemote } from '../src/planner/ring-sync.js';
import {
  DESKTOP_RING_SET,
  type DesktopRing,
  type RingClock,
  type RingElsewhere,
} from '../src/planner/ring-types.js';

const ALARM = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e01';
const TIMER = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e02';
const SONG = '2c1f0a52-6a7b-4a4a-9f0e-0d4a6b1c2e03';
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
        sound: { kind: 'file', item_id: SONG, name: 'Morning.mp3', etag: 'e1' },
        rampSeconds: 30,
        vibrate: true,
        snoozeLimit: 2,
        challenge: { kind: 'maths', difficulty: 'easy', count: 2 },
        label: 'Wake',
      },
      {
        ringKey: `timer:${TIMER}`,
        kind: 'timer',
        refId: TIMER,
        dueAt: '2030-01-01T06:10:00.000Z',
        sound: { kind: 'tone', id: 'default' },
        rampSeconds: 0,
        vibrate: true,
        snoozeLimit: null,
        challenge: { kind: 'none' },
        label: null,
      },
    ],
    bedtimeWindows: [],
  };
}

const clock: RingClock = { now: () => new Date(NOW), at: () => (): void => undefined };

interface Harness {
  readonly sync: RingSync;
  readonly schedule: ReturnType<typeof vi.fn>;
  readonly install: ReturnType<typeof vi.fn>;
  readonly withdraw: ReturnType<typeof vi.fn>;
  readonly settledElsewhere: ReturnType<typeof vi.fn>;
}

function harness(
  hub: RingHub,
  options: { active?: readonly DesktopRing[]; elsewhere?: RingElsewhere } = {},
): Harness {
  const schedule = vi.fn();
  const install = vi.fn(() => Promise.resolve());
  const withdraw = vi.fn();
  const settledElsewhere = vi.fn();
  const remote: RingRemote = {
    elsewhere: () => Promise.resolve(options.elsewhere ?? { kind: 'ringing' }),
    settledElsewhere,
  };
  const sync = new RingSync({
    hub,
    target: { schedule, active: (): readonly DesktopRing[] => options.active ?? [], withdraw },
    clock,
    sounds: { install },
    remote,
  });
  return { sync, schedule, install, withdraw, settledElsewhere };
}

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
      sound: { kind: 'file', item_id: SONG, name: 'Morning.mp3', etag: 'e1' },
      snoozeLimit: 2,
      snoozes: 0,
      challenge: { kind: 'maths', difficulty: 'easy', count: 2 },
    });
  });

  it('schedules the set, downloads its sound files and acknowledges its hash', async () => {
    const fake = hubOf([set('h1')]);
    const { sync, schedule, install } = harness(fake.hub);
    sync.request();
    await settle();
    expect(schedule).toHaveBeenCalledOnce();
    expect(lastScheduled(schedule)).toHaveLength(2);
    expect(install).toHaveBeenCalledWith(lastScheduled(schedule));
    expect(install.mock.invocationCallOrder[0]).toBeLessThan(
      fake.acks.mock.invocationCallOrder[0] ?? 0,
    );
    expect(fake.acks).toHaveBeenCalledWith('client', 'h1');
  });

  it('keeps the sound file of a ring that is ringing now', async () => {
    const ringing: DesktopRing = { ...firstRing(), ringKey: 'alarm:gone' };
    const { sync, install } = harness(hubOf([set('h1')]).hub, { active: [ringing] });
    sync.request();
    await settle();
    expect(install.mock.calls[0]?.[0]).toContainEqual(ringing);
  });

  it('withdraws a ringing alarm that was stopped on another device', async () => {
    const ringing = firstRing();
    const { sync, withdraw, settledElsewhere } = harness(hubOf([set('h1')]).hub, {
      active: [ringing],
      elsewhere: { kind: 'dismissed' },
    });
    sync.request();
    await settle();
    expect(withdraw).toHaveBeenCalledWith(ringing.ringKey);
    expect(settledElsewhere).toHaveBeenCalledWith(ringing, { kind: 'dismissed' });
  });

  it('leaves a ring alone while the hub still has it ringing', async () => {
    const { sync, withdraw } = harness(hubOf([set('h1')]).hub, { active: [firstRing()] });
    sync.request();
    await settle();
    expect(withdraw).not.toHaveBeenCalled();
  });

  it('reads again when the hub says the set changed before the acknowledgement', async () => {
    const fake = hubOf([set('old'), set('new')], (hash) => hash === 'new');
    const { sync, schedule } = harness(fake.hub);
    sync.request();
    await settle();
    expect(fake.reads).toHaveBeenCalledTimes(2);
    expect(schedule).toHaveBeenCalledTimes(2);
  });

  it('rings a snoozed alarm at its snooze time instead of its next set time', async () => {
    const { sync, schedule } = harness(hubOf([set('h1', '2030-01-02T07:00:00.000Z')]).hub);
    sync.request();
    await settle();
    const snoozed: DesktopRing = { ...firstRing(), dueAt: '2030-01-01T06:09:00.000Z', snoozes: 1 };
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
