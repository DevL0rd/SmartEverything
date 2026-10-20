import { describe, expect, it } from 'vitest';
import {
  BELT_STATES,
  DEFAULT_GRADE_PERCENT,
  LINK_PLAN,
  MIN_SESSION_SECONDS,
  TREADMILL_ACTION,
  TREADMILL_FRAME_BATCH,
  TREADMILL_GATT_DUMP,
  TREADMILL_GOALS,
  TREADMILL_POLICY,
  TREADMILL_READ_QUERY,
  TREADMILL_SETTINGS,
  calorieRate,
  goalsOf,
  isWorthKeeping,
  metOf,
  paceSecondsPerKm,
  remoteSpeedVerdict,
  remoteStartVerdict,
  settingsOf,
  treadmillExternalId,
  zoneOf,
  CAPABILITY_CATALOGUE,
  isSampledCapability,
  deviceFamily,
} from '../src';
import { EVENT_MATCH } from '../src/signal-sources/event-match';

describe('speed zones and pace', () => {
  it('splits walking, jogging and running at six and eight kilometres per hour', () => {
    expect(zoneOf(3)).toBe('walk');
    expect(zoneOf(5.9)).toBe('walk');
    expect(zoneOf(6)).toBe('jog');
    expect(zoneOf(8)).toBe('jog');
    expect(zoneOf(8.1)).toBe('run');
  });

  it('gives the pace in seconds per kilometre, and none for a stopped belt', () => {
    expect(paceSecondsPerKm(6)).toBe(600);
    expect(paceSecondsPerKm(0)).toBeNull();
  });

  it('names the device by its Bluetooth address', () => {
    expect(treadmillExternalId('AA:BB:CC:DD:EE:FF')).toBe('kingsmith_treadmill:AA:BB:CC:DD:EE:FF');
  });
});

describe('calories', () => {
  it('uses the walking equation below the switch speed and the running one above', () => {
    const walking = calorieRate({ speedKmh: 4, gradePercent: 4, weightKg: 70, runSwitchKmh: 8 });
    expect(walking.grossPerMinute).toBeCloseTo(
      ((0.1 * (4000 / 60) + 1.8 * (4000 / 60) * 0.04 + 3.5) * 70) / 200,
      6,
    );
    expect(walking.met).toBeCloseTo((walking.grossPerMinute * 200) / 70 / 3.5, 6);
    const running = calorieRate({ speedKmh: 10, gradePercent: 4, weightKg: 70, runSwitchKmh: 8 });
    expect(running.grossPerMinute).toBeCloseTo(
      ((0.2 * (10000 / 60) + 0.9 * (10000 / 60) * 0.04 + 3.5) * 70) / 200,
      6,
    );
    expect(running.netPerMinute).toBeLessThan(running.grossPerMinute);
  });

  it('puts the switch speed itself on the walking side', () => {
    const atSwitch = calorieRate({ speedKmh: 8, gradePercent: 0, weightKg: 70, runSwitchKmh: 8 });
    expect(atSwitch.grossPerMinute).toBeCloseTo(((0.1 * (8000 / 60) + 3.5) * 70) / 200, 6);
  });

  it('works out the average MET of a session and none for an empty one', () => {
    expect(metOf(350, 70, 3600)).toBe(5);
    expect(metOf(350, 70, 0)).toBeNull();
    expect(metOf(350, 0, 3600)).toBeNull();
  });

  it('knows its default grade and keeps short sessions out', () => {
    expect(DEFAULT_GRADE_PERCENT).toBe(4);
    expect(isWorthKeeping({ activeSeconds: MIN_SESSION_SECONDS })).toBe(true);
    expect(isWorthKeeping({ activeSeconds: MIN_SESSION_SECONDS - 1 })).toBe(false);
  });
});

describe('settings and remote start', () => {
  it('starts with remote start off, a six kilometre cap and the stop-without-steps guard on', () => {
    expect(TREADMILL_POLICY.parse({})).toStrictEqual({
      remoteStart: false,
      remoteWho: 'owner',
      remoteMaxKmh: 6,
      stopWithoutSteps: true,
      remoteIncline: false,
      remoteInclineMax: 5,
    });
    expect(settingsOf(undefined)).toMatchObject({
      gradePercent: 4,
      runSwitchKmh: 8,
      stayConnected: true,
      presence: true,
      lubricationDays: 90,
      lubricatedAt: null,
      goals: {},
    });
    expect(TREADMILL_SETTINGS.parse({}).policy.remoteStart).toBe(false);
  });

  it('gives each person the default goals until they set their own', () => {
    const settings = settingsOf({ goals: { walker: { dailyMinutes: 45 } } });
    expect(goalsOf(settings, 'walker')).toMatchObject({
      dailyMinutes: 45,
      weeklyKm: 20,
      weeklySessions: 5,
    });
    expect(goalsOf(settings, 'other')).toStrictEqual(TREADMILL_GOALS.parse({}));
    expect(goalsOf(settings, null).dailyMinutes).toBe(30);
  });

  it('starts from the holder phone always and remotely only when the owner allowed it', () => {
    const closed = TREADMILL_POLICY.parse({});
    const open = TREADMILL_POLICY.parse({ remoteStart: true });
    const both = TREADMILL_POLICY.parse({ remoteStart: true, remoteWho: 'owner_and_walker' });
    const here = { owner: false, walker: false, remote: false };
    expect(remoteStartVerdict(closed, here)).toStrictEqual({ allowed: true });
    const refused = remoteStartVerdict(closed, { ...here, remote: true, owner: true });
    expect(refused.allowed).toBe(false);
    expect(refused.allowed ? '' : refused.reason).toContain('holds the link');
    expect(remoteStartVerdict(open, { owner: true, walker: false, remote: true })).toStrictEqual({
      allowed: true,
    });
    const walkerOnly = remoteStartVerdict(open, { owner: false, walker: true, remote: true });
    expect(walkerOnly.allowed ? '' : walkerOnly.reason).toContain('owner only');
    expect(remoteStartVerdict(both, { owner: false, walker: true, remote: true })).toStrictEqual({
      allowed: true,
    });
  });

  it('lets anyone slow down but caps a remote speed-up', () => {
    const open = TREADMILL_POLICY.parse({ remoteStart: true, remoteMaxKmh: 5 });
    const remote = { owner: true, walker: false, remote: true };
    expect(remoteSpeedVerdict(open, remote, 8, 3)).toStrictEqual({ allowed: true });
    expect(remoteSpeedVerdict(open, remote, 3, 5)).toStrictEqual({ allowed: true });
    expect(remoteSpeedVerdict(open, remote, 3, 5.5)).toMatchObject({
      allowed: false,
      reason: 'Remote speed is capped at 5 km/h in the treadmill settings.',
    });
    expect(remoteSpeedVerdict(TREADMILL_POLICY.parse({}), remote, 3, 4)).toMatchObject({
      allowed: false,
    });
    expect(remoteSpeedVerdict(open, { ...remote, remote: false }, 3, 14)).toStrictEqual({
      allowed: true,
    });
  });
});

describe('treadmill contract', () => {
  it('registers the capabilities, samples the per-second numbers and finds the family by model', () => {
    expect(CAPABILITY_CATALOGUE.belt_speed.group).toBe('fitness');
    expect(isSampledCapability('belt_speed')).toBe(true);
    expect(isSampledCapability('belt_state')).toBe(false);
    expect(deviceFamily({ kind: 'appliance', model: 'kingsmith.treadmill.k15' })).toBe('treadmill');
    expect(BELT_STATES).toContain('safety_stop');
  });

  it('accepts a GATT dump and refuses upper-case or malformed UUIDs', () => {
    const dump = {
      name: 'KS-K15',
      services: [
        {
          uuid: 'fe00',
          characteristics: [{ uuid: 'fe01', properties: ['notify'], value: '00ff' }],
        },
      ],
    };
    expect(TREADMILL_GATT_DUMP.parse(dump)).toStrictEqual(dump);
    expect(() =>
      TREADMILL_GATT_DUMP.parse({ ...dump, services: [{ uuid: 'FE00', characteristics: [] }] }),
    ).toThrow();
    expect(() => TREADMILL_GATT_DUMP.parse({ name: 'x', services: [] })).toThrow();
  });

  it('accepts a frame batch and a link plan', () => {
    expect(
      TREADMILL_FRAME_BATCH.parse({
        frames: [{ at: '2026-10-18T10:00:00.000Z', characteristic: 'fe01', hex: 'f8a2' }],
        link: { phase: 'linked', rssi: -60, reconnects: 0, detail: null },
      }).frames,
    ).toHaveLength(1);
    expect(() =>
      TREADMILL_FRAME_BATCH.parse({
        frames: [],
        link: { phase: 'nope', rssi: null, reconnects: 0, detail: null },
      }),
    ).toThrow();
    expect(() => LINK_PLAN.parse({ deviceId: 'x' })).toThrow();
  });

  it('reads actions and queries by their discriminators', () => {
    expect(TREADMILL_ACTION.parse({ action: 'take_over' })).toStrictEqual({ action: 'take_over' });
    expect(
      TREADMILL_ACTION.parse({ action: 'configure', settings: { policy: { remoteStart: true } } }),
    ).toMatchObject({ settings: { policy: { remoteStart: true } } });
    expect(() => TREADMILL_ACTION.parse({ action: 'set_goal' })).toThrow();
    expect(TREADMILL_READ_QUERY.parse({ view: 'sessions', limit: '10' }).limit).toBe(10);
    expect(() => TREADMILL_READ_QUERY.parse({ view: 'everything' })).toThrow();
  });
});

describe('automation events a treadmill sends', () => {
  it('lets an automation match the phase, the fault code and the reason the hub puts in the event', () => {
    const keys = (kind: 'activity' | 'fault' | 'maintenance' | 'button'): string[] =>
      EVENT_MATCH[kind].map((entry) => entry.key);
    expect(keys('activity')).toEqual(expect.arrayContaining(['phase', 'walker', 'kind', 'goal']));
    expect(keys('fault')).toContain('code');
    expect(keys('maintenance')).toContain('reason');
    expect(keys('button')).toContain('button');
    const phase = EVENT_MATCH.activity.find((entry) => entry.key === 'phase');
    expect(phase?.values).toEqual(['started', 'paused', 'resumed', 'finished', 'goal_reached']);
  });
});
