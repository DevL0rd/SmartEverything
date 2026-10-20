import { bytesToHex, wilinkChecksum } from '@smarteverything/ble';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { MetricSeries, TreadmillLiveNotice, TreadmillSession } from '@smarteverything/domain';
import { entrySettingsOf } from '../../../src/local/treadmill/config';
import { recomputeSessions } from '../../../src/local/treadmill/figures';
import { TreadmillHealth } from '../../../src/local/treadmill/health';
import { actTreadmill } from '../../../src/local/treadmill/acts';
import { readTreadmill } from '../../../src/local/treadmill/views';
import {
  feed,
  g15Rig,
  setScale,
  sleepFrame,
  stopBelt,
  walk,
  walkFrame,
} from '../../support/g15-walk';
import { captureLogs, testLogger, type CapturedLogs } from '../../support/logs';
import {
  COUNTDOWN,
  FTMS_GATT,
  IDLE,
  RUNNING,
  STOPPED,
  statusHex,
  treadmillRig,
  type TreadmillRig,
} from '../../support/treadmill-rig';

let rig: TreadmillRig;
let logs: CapturedLogs;

beforeEach(async () => {
  logs = captureLogs();
  rig = await treadmillRig();
});

afterEach(async () => {
  await rig.close();
});

function walkFor(seconds: number, speed10 = 30): void {
  rig.batch(0, [statusHex({ state: IDLE })]);
  rig.batch(1, [statusHex({ state: COUNTDOWN })]);
  for (let second = 2; second <= seconds; second += 1) {
    rig.batch(second, [
      statusHex({
        state: RUNNING,
        speed10,
        time: second - 1,
        distance10m: Math.floor(((second - 1) * (speed10 / 10)) / 3.6 / 10),
        steps: (second - 1) * 2,
      }),
    ]);
  }
}

function prefsHex(goalType: number, goal: number): string {
  const body = new Array<number>(20).fill(0);
  body[0] = 0xf8;
  body[1] = 0xa6;
  body[2] = goalType;
  body[3] = (goal >> 16) & 0xff;
  body[4] = (goal >> 8) & 0xff;
  body[5] = goal & 0xff;
  body[7] = 60;
  body[8] = 8;
  body[9] = 1;
  body[10] = 2;
  body[11] = 5;
  body[12] = 1;
  body[18] = wilinkChecksum(body, 1, 18);
  body[19] = 0xfd;
  return bytesToHex(Uint8Array.from(body));
}

function events(kind: string): { phase?: unknown; distance_m?: unknown; kcal?: unknown }[] {
  return rig.events.filter((event) => event.kind === kind).map((event) => event.details);
}

describe('a walk reported by the phone', () => {
  it('opens a session when the belt runs, keeps its samples and closes it when the belt stops', () => {
    walkFor(62);
    rig.batch(63, [statusHex({ state: STOPPED, time: 61, distance10m: 51, steps: 122 })]);
    const sessions = rig.test.store.treadmillSessions.finished(rig.row().id, rig.owner.profile.id);
    expect(sessions).toHaveLength(1);
    const [session] = sessions;
    expect(session?.activeSeconds).toBe(61);
    expect(session?.steps).toBe(122);
    expect(session?.source).toBe('live');
    expect(rig.test.store.treadmillSessions.samples(session?.id ?? '').length).toBeGreaterThan(55);
    expect(rig.test.store.treadmillSessions.openIds()).toEqual([]);
  });

  it('announces the start and the finish once each, without the walker’s calories', () => {
    walkFor(62);
    rig.batch(63, [statusHex({ state: STOPPED, time: 61, distance10m: 51, steps: 122 })]);
    expect(events('activity').map((details) => details.phase)).toEqual(['started', 'finished']);
    expect(events('activity')[1]).toMatchObject({ phase: 'finished', distance_m: 510 });
    expect(rig.events.every((event) => !('kcal' in event.details))).toBe(true);
  });

  it('writes the walk to the walker’s health as one exercise session with speed samples', () => {
    walkFor(62);
    rig.batch(63, [statusHex({ state: STOPPED, time: 61, distance10m: 51, steps: 122 })]);
    const records = rig.test.store.health.records(
      {
        types: ['ExerciseSession', 'Speed'],
        from: '2026-10-18T00:00:00.000Z',
        to: '2026-10-19T00:00:00.000Z',
      },
      rig.owner.profile.id,
    );
    expect(records.map((record) => record.type)).toEqual(['ExerciseSession', 'Speed']);
    expect(records.every((record) => record.recordId.startsWith('treadmill:'))).toBe(true);
    expect(records[0]?.sourceApp).toBe('smarteverything.treadmill');
  });

  it('throws away a run too short to be a session and says so in the log', () => {
    walkFor(6);
    rig.batch(7, [statusHex({ state: STOPPED, time: 5 })]);
    expect(rig.test.store.treadmillSessions.finished(rig.row().id, undefined)).toEqual([]);
    expect(logs.events()).toContain('treadmill.session_discarded');
    expect(events('activity').map((details) => details.phase)).toEqual(['started']);
  });

  it('tells the live page about the belt once a second only while someone watches', () => {
    walkFor(4);
    expect(rig.notices).toHaveLength(0);
    rig.watched.value = true;
    const result = rig.batch(5, [statusHex({ state: RUNNING, speed10: 30, time: 4, steps: 8 })]);
    expect(result).toEqual({ live: true, accepted: 1 });
    expect(rig.notices).toHaveLength(1);
  });

  it('shows the walker’s body figures to the walker and the owner but not to anyone else', () => {
    rig.weigh(rig.owner, 80);
    rig.weigh(rig.member, 45);
    rig.holder.clientId = rig.member.client.id;
    rig.watched.value = true;
    walkFor(12);
    const [owner, member] = noticesNow();
    expect(owner?.frame.body).toMatchObject({ weightKg: 45 });
    expect(member?.frame.body).toMatchObject({ weightKg: 45 });
    expect(owner?.frame.belt.speedKmh).toBe(3);
  });

  it('keeps the walker’s body figures from a member who is not the walker', () => {
    rig.weigh(rig.owner, 80);
    rig.watched.value = true;
    walkFor(12);
    const [owner, member] = noticesNow();
    expect(owner?.frame.body).toMatchObject({ weightKg: 80 });
    expect(member?.frame.body).toBeNull();
    expect(member?.frame.belt).toMatchObject({ state: 'running', speedKmh: 3 });
  });
});

function noticesNow(): (TreadmillLiveNotice | null)[] {
  return rig.notices.at(-1)?.notices ?? [];
}

describe('what the belt reports about itself', () => {
  it('keeps the belt’s state and link in the device state and the speed in the metric history', () => {
    walkFor(3);
    const latest = (capability: string): unknown =>
      rig.states.filter((update) => update.capability === capability).at(-1)?.value;
    expect(latest('belt_state')).toBe('running');
    expect(latest('belt_link')).toBe('linked');
    expect(rig.pushed.filter((point) => point.capability === 'belt_speed').length).toBeGreaterThan(
      0,
    );
  });

  it('writes the numbers to the state at most every ten seconds', () => {
    walkFor(25);
    const speedWrites = rig.states.filter((update) => update.capability === 'belt_speed');
    expect(speedWrites.length).toBeGreaterThanOrEqual(2);
    expect(speedWrites.length).toBeLessThanOrEqual(4);
  });

  it('announces each panel button press once', () => {
    walkFor(4);
    rig.batch(5, [statusHex({ state: RUNNING, speed10: 30, time: 4, button: 2 })]);
    rig.batch(6, [statusHex({ state: RUNNING, speed10: 30, time: 5, button: 2 })]);
    expect(rig.events.filter((event) => event.kind === 'button')).toHaveLength(1);
  });

  it('remembers the preferences the pad reports and tells the hub once', () => {
    rig.batch(1, [prefsHex(0, 0)]);
    expect(rig.fleet.of(rig.row()).runtime.pad).toMatchObject({
      maxSpeedKmh: 6,
      startSpeedKmh: 0.8,
      autoStart: true,
      sensitivity: 'medium',
      childLock: true,
    });
    expect(rig.states.find((update) => update.capability === 'belt_max_speed')?.value).toBe(6);
    expect(rig.observed.at(-1)).toHaveProperty('pad');
  });

  it('announces reaching the pad goal once per session', () => {
    rig.batch(0, [prefsHex(1, 50)]);
    walkFor(60, 50);
    const goals = events('activity').filter((details) => details.phase === 'goal_reached');
    expect(goals).toHaveLength(1);
  });

  it('logs a frame it cannot read and goes on', () => {
    rig.batch(1, ['f8a2010203fd', statusHex({ state: IDLE })]);
    expect(logs.events()).toContain('treadmill.frame_unreadable');
    expect(rig.states.some((update) => update.capability === 'belt_state')).toBe(true);
  });

  it('reports a byte it cannot name once', () => {
    rig.batch(1, [statusHex({ state: 11 })]);
    rig.batch(2, [statusHex({ state: 11 })]);
    expect(logs.events().filter((event) => event === 'treadmill.unknown_byte')).toHaveLength(1);
  });
});

describe('a standard belt that reconnects mid walk', () => {
  it('does not end the session on the stopped status replayed when the link is rebuilt', async () => {
    const standard = await treadmillRig('ftms', FTMS_GATT);
    try {
      const data = (time: number): string =>
        '0424' +
        [0x2c, 0x01, 0, 0, 0, time, 0, time * 2, 0, 0]
          .map((byte) => byte.toString(16).padStart(2, '0'))
          .join('');
      const send = (
        seconds: number,
        phase: 'linked' | 'connecting',
        frames: readonly [string, string][],
      ): void => {
        standard.clock.advanceTo(
          new Date(Date.parse('2026-10-18T10:00:00.000Z') + seconds * 1000).toISOString(),
        );
        standard.ingest.process(standard.row(), standard.owner.client, {
          frames: frames.map(([characteristic, hex]) => ({
            at: standard.clock.now().toISOString(),
            characteristic,
            hex,
          })),
          link: { phase, rssi: -55, reconnects: 0, detail: null },
        });
      };
      send(1, 'linked', [
        ['2ada', '04'],
        ['2acd', data(1)],
      ]);
      send(5, 'connecting', []);
      send(6, 'connecting', [['2ada', '0201']]);
      send(7, 'linked', [['2acd', data(7)]]);
      expect(standard.fleet.of(standard.row()).runtime.machine.state).toBe('running');
      expect(standard.test.store.treadmillSessions.openIds()).toHaveLength(1);
    } finally {
      await standard.close();
    }
  });
});

describe('a walk on the G15 with an incline', () => {
  let g15: TreadmillRig;

  beforeEach(async () => {
    g15 = await g15Rig();
    g15.weigh(g15.owner, 80);
  });

  afterEach(async () => {
    await g15.close();
  });

  function finishedSession(): TreadmillSession {
    const [session] = g15.test.store.treadmillSessions.finished(g15.row().id, undefined);
    if (session === undefined) {
      throw new Error('no finished session');
    }
    return session;
  }

  it('keeps the raw belt incline per sample and counts the climb with the scale setting', () => {
    walk(g15, 60, { kmh: 3.6, incline: 10 });
    stopBelt(g15, 61, 60);
    const session = finishedSession();
    const samples = g15.test.store.treadmillSessions.samples(session.id);
    expect(samples.length).toBeGreaterThan(55);
    expect(samples.every((sample) => sample.incline === 10)).toBe(true);
    expect(session.climbM).toBeCloseTo(2.95, 1);
    expect(session.inclineMax).toBe(10);
    expect(session.inclineAvg).toBeCloseTo(10, 5);
    expect(Object.keys(session.inclineSeconds)).toEqual(['10']);
  });

  it('counts a percent scale at the full grade and a levels scale at half a percent per level', () => {
    setScale(g15, 'percent');
    walk(g15, 60, { kmh: 3.6, incline: 10 });
    stopBelt(g15, 61, 60);
    expect(finishedSession().climbM).toBeCloseTo(5.9, 1);
  });

  it('puts the live grade into the calories and names the estimate as the source', () => {
    setScale(g15, 'percent');
    walk(g15, 60, { kmh: 3.6, incline: 10 });
    stopBelt(g15, 61, 60);
    const steep = finishedSession();
    expect(steep.kcalSource).toBe('estimate');
    expect(steep.kcal).toBeGreaterThan(0);
  });

  it('takes the belt’s own energy first and the grips heart rate before the watch', () => {
    g15.watched.value = true;
    walk(g15, 30, { kmh: 3.6, incline: 4, beltKcal: 7, heartRate: 120 });
    const frame = g15.notices.at(-1)?.notices[0]?.frame;
    expect(frame?.body).toMatchObject({ kcal: 7, kcalSource: 'belt', heartRate: 120 });
    expect(frame?.body?.heartRateSource).toBe('grips');
    expect(frame?.belt).toMatchObject({
      inclinePercent: 4,
      inclineGrade: 2,
      inclineScale: 'unconfirmed',
    });
    stopBelt(g15, 31, 30);
    const session = finishedSession();
    expect(session.kcalSource).toBe('belt');
    expect(session.kcal).toBe(7);
    expect(session.heartRateSource).toBe('grips');
  });

  it('recomputes the stored climb from the samples when the owner changes the scale', () => {
    walk(g15, 60, { kmh: 3.6, incline: 10 });
    stopBelt(g15, 61, 60);
    expect(finishedSession().climbM).toBeCloseTo(2.95, 1);
    const device = setScale(g15, 'percent');
    const settings = entrySettingsOf(g15.fleet.of(device).entry);
    const changed = recomputeSessions(
      { store: g15.test.store, health: new TreadmillHealth(g15.test.store) },
      device.id,
      settings,
      true,
    );
    expect(changed).toHaveLength(1);
    expect(finishedSession().climbM).toBeCloseTo(5.9, 1);
  });

  it('recomputes stored sessions when the owner changes the scale through the settings action', async () => {
    walk(g15, 60, { kmh: 3.6, incline: 10 });
    stopBelt(g15, 61, 60);
    expect(finishedSession().climbM).toBeCloseTo(2.95, 1);
    await actTreadmill(
      {
        store: g15.test.store,
        fleet: g15.fleet,
        local: { observe: () => Promise.resolve() },
        bridges: { takeOver: () => Promise.reject(new Error('unused')) },
        health: new TreadmillHealth(g15.test.store),
        broker: { run: () => Promise.reject(new Error('unused')) },
        holderOf: () => null,
        now: g15.clock.now,
        log: testLogger('treadmill'),
      },
      g15.row(),
      {
        clientId: g15.owner.client.id,
        role: 'owner',
        profileId: g15.owner.profile.id,
        client: g15.owner.client,
        phone: true,
      },
      { action: 'configure', settings: { inclineScale: 'percent' } },
    );
    expect(finishedSession().climbM).toBeCloseTo(5.9, 1);
  });

  it('keeps the heart rate when no weight is known', async () => {
    const bare = await g15Rig();
    try {
      bare.watched.value = true;
      walk(bare, 30, { kmh: 3.6, incline: 4, heartRate: 120 });
      const body = bare.notices.at(-1)?.notices[0]?.frame.body;
      expect(body).toMatchObject({
        heartRate: 120,
        heartRateSource: 'grips',
        weightKg: null,
        met: null,
        kcalSource: null,
      });
    } finally {
      await bare.close();
    }
  });

  it('shows standby only when the belt reports sleep and says so when the link drops while stopped', () => {
    feed(g15, 1, [sleepFrame(true), walkFrame({ second: 0, kmh: 0, incline: 0 })]);
    expect(g15.states.filter((update) => update.capability === 'belt_state').at(-1)?.value).toBe(
      'standby',
    );
    feed(g15, 2, [sleepFrame(false), walkFrame({ second: 0, kmh: 0, incline: 0 })]);
    expect(g15.states.filter((update) => update.capability === 'belt_state').at(-1)?.value).toBe(
      'idle',
    );
    feed(g15, 3, [], 'lost');
    const view = readTreadmill(
      {
        store: g15.test.store,
        fleet: g15.fleet,
        holder: () => null,
        walkerOf: (device) => g15.ingest.walkerFacts(device),
        series: (): MetricSeries => ({ resolution: 'second', points: [] }),
        now: g15.clock.now,
      },
      g15.row(),
      { clientId: g15.owner.client.id, role: 'owner', profileId: g15.owner.profile.id },
      { view: 'state' },
    );
    expect(view.view === 'state' ? view.link.detail : null).toBe('Standby or switched off');
  });
});
