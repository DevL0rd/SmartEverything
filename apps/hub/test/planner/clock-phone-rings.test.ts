import {
  hashClientToken,
  createClientToken,
  type PlannerPreferences,
  type PlannerRingTarget,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SimulatedClock } from '../../src/clock/simulated';
import { plannerPreferencesOf } from '../../src/planner/preferences';
import {
  PHONE_RING_ACK,
  PHONE_RING_SET,
  PhoneRings,
  type PhoneRingSet,
} from '../../src/planner/phone-rings';
import type { PlannerTimerInput } from '../../src/store/repositories/planner-timers';
import type { PlannerAlarmInput } from '../../src/store/repositories/planner-alarms';
import { testLogger } from '../support/logs';
import { addPerson, addPhoneDevice, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const START = '2026-11-07T08:00:00.000Z';

interface Sent {
  readonly clientId: string;
  readonly set: PhoneRingSet;
}

let test: TestStore;
let clock: SimulatedClock;
let owner: TestPerson;
let other: TestPerson;
let sent: Sent[];
let reachable: boolean;
let rings: PhoneRings;

function alarmInput(change: Partial<PlannerAlarmInput> = {}): PlannerAlarmInput {
  return {
    profile_id: owner.profileId,
    label: 'Work',
    time: '07:00',
    days: [1, 2, 3, 4, 5],
    once_on: null,
    skip_on: null,
    enabled: true,
    sound: { kind: 'tone', id: 'sunrise' },
    ramp_seconds: 30,
    vibrate: true,
    snooze_minutes: 9,
    snooze_limit: null,
    challenge: { kind: 'none' },
    sunrise: null,
    smart_minutes: null,
    wake_automation_id: null,
    wake_lead_minutes: null,
    targets: [{ kind: 'client', clientId: owner.client.id }],
    watch: [],
    source: 'planner',
    ...change,
  };
}

function timerInput(
  targets: readonly PlannerRingTarget[],
  endsAt = '2026-11-07T08:10:00.000Z',
): PlannerTimerInput {
  return {
    profile_id: owner.profileId,
    label: 'Tea',
    duration_ms: 600_000,
    state: 'running',
    ends_at: endsAt,
    remaining_ms: null,
    targets,
  };
}

function toOwner(): Sent[] {
  return sent.filter((push) => push.clientId === owner.client.id);
}

beforeEach(async () => {
  clock = new SimulatedClock(START);
  test = await testStore(() => clock.now());
  owner = addPerson(test, 'Owner', 'owner');
  other = addPerson(test, 'Other', 'member');
  sent = [];
  reachable = true;
  rings = new PhoneRings({
    store: test.store,
    channel: {
      send: (clientId, set): Promise<boolean> => {
        sent.push({ clientId, set: PHONE_RING_SET.parse(set) });
        return Promise.resolve(reachable);
      },
    },
    now: (): Date => clock.now(),
    log: testLogger('phone-rings'),
  });
  rings.start();
});

afterEach(async () => {
  rings.stop();
  await test.close();
});

describe('pushing the desired set', () => {
  it('pushes the rules of an added alarm to its target phone only', async () => {
    const alarm = test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.clientId).toBe(owner.client.id);
    expect(sent[0]?.set.alarms).toEqual([
      {
        id: alarm.id,
        profileId: owner.profileId,
        label: 'Work',
        time: '07:00',
        days: [1, 2, 3, 4, 5],
        onceOn: null,
        skipOn: null,
        sound: { kind: 'tone', id: 'sunrise' },
        rampSeconds: 30,
        vibrate: true,
        snoozeMinutes: 9,
        snoozeLimit: null,
        challenge: { kind: 'none' },
      },
    ]);
    expect(sent[0]?.set.timers).toEqual([]);
    expect(sent.some((push) => push.clientId === other.client.id)).toBe(false);
  });

  it('pushes again after an alarm edit and carries the new rule', async () => {
    const alarm = test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    test.store.plannerAlarms.update(alarm.id, owner.profileId, {
      time: '06:30',
      skip_on: '2026-11-09',
    });
    await rings.settled();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.set.alarms[0]).toMatchObject({ time: '06:30', skipOn: '2026-11-09' });
    expect(sent[1]?.set.version).not.toBe(sent[0]?.set.version);
  });

  it('sends rules and never a horizon of instants for a repeating alarm', async () => {
    test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    const [alarm] = sent[0]?.set.alarms ?? [];
    expect(Object.keys(alarm ?? {})).not.toContain('next');
    expect(sent[0]?.set.alarms).toHaveLength(1);
  });

  it('drops a disabled alarm from the set', async () => {
    const alarm = test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    test.store.plannerAlarms.update(alarm.id, owner.profileId, { enabled: false });
    await rings.settled();
    expect(sent.at(-1)?.set.alarms).toEqual([]);
  });

  it('pushes a running timer as its absolute end instant and drops it when paused', async () => {
    const timer = test.store.plannerTimers.insert(
      timerInput([{ kind: 'client', clientId: owner.client.id }]),
    );
    await rings.settled();
    expect(sent.at(-1)?.set.timers).toEqual([
      {
        id: timer.id,
        profileId: owner.profileId,
        label: 'Tea',
        endsAt: '2026-11-07T08:10:00.000Z',
      },
    ]);
    test.store.plannerTimers.update(timer.id, owner.profileId, {
      state: 'paused',
      ends_at: null,
      remaining_ms: 300_000,
    });
    await rings.settled();
    expect(sent.at(-1)?.set.timers).toEqual([]);
  });

  it('tells a phone that lost its target to clear the rule', async () => {
    const alarm = test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    test.store.plannerAlarms.update(alarm.id, owner.profileId, { targets: [] });
    await rings.settled();
    expect(toOwner().at(-1)?.set.alarms).toEqual([]);
  });

  it('does not push again when a change leaves the set unchanged', async () => {
    const alarm = test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    test.store.plannerAlarms.update(alarm.id, owner.profileId, { smart_minutes: 20 });
    await rings.settled();
    expect(sent).toHaveLength(1);
  });

  it('resolves a paired phone device target to its client', async () => {
    const phone = addPhoneDevice(test, {
      clientId: other.client.id,
      profileId: other.profileId,
      name: 'Other phone',
    });
    test.store.plannerAlarms.insert(
      alarmInput({ targets: [{ kind: 'device', deviceId: phone.device.id }] }),
    );
    await rings.settled();
    expect(sent.map((push) => push.clientId)).toEqual([other.client.id]);
  });

  it('merges the alarms of every person that targets the same phone', async () => {
    test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    test.store.plannerAlarms.insert(
      alarmInput({
        profile_id: other.profileId,
        label: 'Gym',
        time: '05:30',
        targets: [{ kind: 'client', clientId: owner.client.id }],
      }),
    );
    await rings.settled();
    expect(
      toOwner()
        .at(-1)
        ?.set.alarms.map((alarm) => alarm.label)
        .sort(),
    ).toEqual(['Gym', 'Work']);
  });

  it('gives a desktop client its own ring set', async () => {
    const desktop = test.store.clients.create({
      name: 'Desk',
      platform: 'desktop',
      kind: 'computer',
      role: 'member',
      tokenHash: hashClientToken(createClientToken()),
      profileId: owner.profileId,
    });
    await rings.settled();
    test.store.plannerAlarms.insert(
      alarmInput({ targets: [{ kind: 'client', clientId: desktop.id }] }),
    );
    await rings.settled();
    expect(sent.map((entry) => entry.clientId)).toEqual([desktop.id]);
    expect((await rings.desired(desktop.id)).alarms).toHaveLength(1);
    expect((await rings.desired(owner.client.id)).alarms).toHaveLength(0);
    sent.length = 0;
    rings.connected(desktop.id);
    await rings.settled();
    expect(sent.map((entry) => entry.clientId)).toEqual([desktop.id]);
  });

  it('ignores a browser client', async () => {
    const desktop = test.store.clients.create({
      name: 'Tab',
      platform: 'web',
      kind: 'browser',
      role: 'member',
      tokenHash: hashClientToken(createClientToken()),
      profileId: owner.profileId,
    });
    await rings.settled();
    test.store.plannerAlarms.insert(
      alarmInput({ targets: [{ kind: 'client', clientId: desktop.id }] }),
    );
    await rings.settled();
    rings.connected(desktop.id);
    await rings.settled();
    expect(sent).toHaveLength(0);
  });
});

describe('acknowledgement', () => {
  it('records the ack of the current version with its time', async () => {
    test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    await Promise.resolve();
    const version = sent[0]?.set.version ?? '';
    clock.advanceTo('2026-11-07T08:00:05.000Z');
    expect(rings.acknowledge(owner.client.id, PHONE_RING_ACK.parse({ version }).version)).toBe(
      true,
    );
    expect(rings.stateOf(owner.client.id)).toEqual({
      version,
      reached: true,
      ackedAt: '2026-11-07T08:00:05.000Z',
    });
  });

  it('ignores an ack of a version that was already replaced', async () => {
    const alarm = test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    const first = sent[0]?.set.version ?? '';
    test.store.plannerAlarms.update(alarm.id, owner.profileId, { time: '08:00' });
    await rings.settled();
    expect(rings.acknowledge(owner.client.id, first)).toBe(false);
    expect(rings.stateOf(owner.client.id)?.ackedAt).toBeNull();
  });
});

describe('reconnect', () => {
  it('sends the current set on the connected event, even with nothing to ring', async () => {
    rings.connected(owner.client.id);
    await rings.settled();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.set).toMatchObject({ alarms: [], timers: [] });
  });

  it('keeps an unreached push pending, never retries on time, and re-sends on reconnect', async () => {
    reachable = false;
    test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    await Promise.resolve();
    await Promise.resolve();
    expect(rings.stateOf(owner.client.id)).toMatchObject({ reached: false, ackedAt: null });
    clock.advanceTo('2026-11-08T08:00:00.000Z');
    expect(sent).toHaveLength(1);
    reachable = true;
    rings.connected(owner.client.id);
    await rings.settled();
    expect(sent).toHaveLength(2);
    expect(sent[1]?.set.version).toBe(sent[0]?.set.version);
    await Promise.resolve();
    await Promise.resolve();
    expect(rings.stateOf(owner.client.id)?.reached).toBe(true);
  });

  it('re-sends an already acknowledged set when the phone reconnects', async () => {
    test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    rings.acknowledge(owner.client.id, sent[0]?.set.version ?? '');
    rings.connected(owner.client.id);
    await rings.settled();
    expect(sent).toHaveLength(2);
    expect(rings.stateOf(owner.client.id)?.ackedAt).toBeNull();
  });
});

describe('the ring set a phone installs', () => {
  function readOwner(): ReturnType<PhoneRings['read']> {
    return rings.read(owner.client.id, owner.profileId);
  }

  async function savePreferences(
    change: (current: PlannerPreferences) => PlannerPreferences,
  ): Promise<void> {
    test.store.plannerPreferences.put(
      owner.profileId,
      change(plannerPreferencesOf(test.store, owner.profileId)),
    );
    rings.preferencesChanged(owner.profileId);
    await rings.settled();
  }

  it('carries the sound, the snooze limit and the challenge of each ring', async () => {
    test.store.plannerAlarms.insert(
      alarmInput({
        snooze_limit: 3,
        challenge: { kind: 'maths', difficulty: 'hard', count: 4 },
      }),
    );
    await rings.settled();
    const [ring] = (await readOwner()).rings;
    expect(ring).toMatchObject({
      sound: { kind: 'tone', id: 'sunrise' },
      snoozeLimit: 3,
      challenge: { kind: 'maths', difficulty: 'hard', count: 4 },
    });
  });

  it('gives a timer the clock default sound and no limit or challenge', async () => {
    test.store.plannerTimers.insert(timerInput([{ kind: 'client', clientId: owner.client.id }]));
    await rings.settled();
    const [ring] = (await readOwner()).rings;
    expect(ring).toMatchObject({
      kind: 'timer',
      sound: { kind: 'tone', id: 'default' },
      snoozeLimit: null,
      challenge: { kind: 'none' },
    });
  });

  it('records what the phone read so its acknowledgement matches', async () => {
    test.store.plannerAlarms.insert(alarmInput());
    await rings.settled();
    const set = await readOwner();
    expect(rings.acknowledge(owner.client.id, set.hash)).toBe(true);
  });

  it('computes the next bedtime windows from the bedtime preferences', async () => {
    await savePreferences((current) => ({
      ...current,
      bedtime: {
        ...current.bedtime,
        enabled: true,
        wind_down_minutes: 30,
        do_not_disturb: true,
        schedule: [{ days: [0, 1, 2, 3, 4, 5, 6], bed: '23:00', wake: '07:00' }],
      },
    }));
    await rings.settled();
    const { bedtimeWindows } = await readOwner();
    expect(bedtimeWindows).toHaveLength(7);
    expect(bedtimeWindows[0]).toEqual({
      windDownAt: '2026-11-07T22:30:00.000Z',
      bedAt: '2026-11-07T23:00:00.000Z',
      wakeAt: '2026-11-08T07:00:00.000Z',
    });
  });

  it('gives no windows while bedtime or Do not disturb is off', async () => {
    const schedule = [{ days: [1, 2, 3, 4, 5], bed: '23:00', wake: '07:00' }] as const;
    await savePreferences((current) => ({
      ...current,
      bedtime: { ...current.bedtime, enabled: false, schedule },
    }));
    await rings.settled();
    expect((await readOwner()).bedtimeWindows).toEqual([]);
    await savePreferences((current) => ({
      ...current,
      bedtime: { ...current.bedtime, enabled: true, do_not_disturb: false },
    }));
    await rings.settled();
    expect((await readOwner()).bedtimeWindows).toEqual([]);
  });

  it('pushes the phones of a person again when the bedtime changes and not when it does not', async () => {
    rings.connected(owner.client.id);
    await rings.settled();
    const before = sent.length;
    await savePreferences((current) => current);
    await rings.settled();
    expect(sent).toHaveLength(before);
    await savePreferences((current) => ({
      ...current,
      bedtime: {
        ...current.bedtime,
        enabled: true,
        schedule: [{ days: [1], bed: '23:00', wake: '07:00' }],
      },
    }));
    await rings.settled();
    expect(sent).toHaveLength(before + 1);
    expect(sent.every((push) => push.clientId === owner.client.id)).toBe(true);
  });

  it('pushes again when the clock default sound changes for a running timer', async () => {
    test.store.plannerTimers.insert(timerInput([{ kind: 'client', clientId: owner.client.id }]));
    await rings.settled();
    const before = sent.length;
    await savePreferences((current) => ({
      ...current,
      clock: { ...current.clock, sound: { kind: 'tone', id: 'birds' } },
    }));
    await rings.settled();
    expect(sent).toHaveLength(before + 1);
    expect(toOwner().at(-1)?.set.timerSound).toEqual({ kind: 'tone', id: 'birds' });
  });
});
