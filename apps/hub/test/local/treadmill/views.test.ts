import {
  ApiError,
  type MetricSeries,
  type TreadmillView,
  type WatchBridge,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { actTreadmill, type ActDeps, type Actor } from '../../../src/local/treadmill/acts';
import { TreadmillHealth } from '../../../src/local/treadmill/health';
import type { WalkerFacts } from '../../../src/local/treadmill/live';
import { readTreadmill, type ViewDeps, type Viewer } from '../../../src/local/treadmill/views';
import { captureLogs, testLogger } from '../../support/logs';
import {
  COUNTDOWN,
  IDLE,
  RUNNING,
  STOPPED,
  statusHex,
  treadmillRig,
  type Person,
  type TreadmillRig,
} from '../../support/treadmill-rig';

let rig: TreadmillRig;
let deps: ViewDeps;
let takeOvers: string[];

beforeEach(async () => {
  captureLogs();
  rig = await treadmillRig();
  takeOvers = [];
  deps = {
    store: rig.test.store,
    fleet: rig.fleet,
    holder: (): WatchBridge => ({
      clientId: rig.owner.client.id,
      clientName: 'Owner phone',
      since: '2026-10-18T09:00:00.000Z',
    }),
    walkerOf: (device): WalkerFacts => rig.ingest.walkerFacts(device),
    series: (): MetricSeries => ({ resolution: 'second', points: [] }),
    now: rig.clock.now,
  };
});

afterEach(async () => {
  await rig.close();
});

function viewer(person: Person): Viewer {
  return { clientId: person.client.id, role: person.client.role, profileId: person.profile.id };
}

function actor(person: Person, phone = true): Actor {
  return { ...viewer(person), client: person.client, phone };
}

function read(person: Person, query: Parameters<typeof readTreadmill>[3]): TreadmillView {
  return readTreadmill(deps, rig.row(), viewer(person), query);
}

function walk(by: Person, from: number, seconds = 40): void {
  rig.holder.clientId = by.client.id;
  rig.batch(from, [statusHex({ state: IDLE })], by);
  rig.batch(from + 1, [statusHex({ state: COUNTDOWN })], by);
  for (let second = 2; second <= seconds; second += 1) {
    rig.batch(
      from + second,
      [
        statusHex({
          state: RUNNING,
          speed10: 40,
          time: second - 1,
          distance10m: second,
          steps: second * 2,
        }),
      ],
      by,
    );
  }
  rig.batch(
    from + seconds + 1,
    [statusHex({ state: STOPPED, time: seconds - 1, distance10m: seconds, steps: seconds * 2 })],
    by,
  );
}

function isView<K extends TreadmillView['view']>(
  value: TreadmillView,
  view: K,
): value is Extract<TreadmillView, { view: K }> {
  return value.view === view;
}

function only<K extends TreadmillView['view']>(
  value: TreadmillView,
  view: K,
): Extract<TreadmillView, { view: K }> {
  if (!isView(value, view)) {
    throw new Error(`expected the ${view} view, received ${value.view}`);
  }
  return value;
}

describe('the state of a treadmill', () => {
  it('shows the owner the link, limits and a start that is allowed on the holder phone', () => {
    rig.batch(1, [statusHex({ state: IDLE })]);
    const state = only(read(rig.owner, { view: 'state' }), 'state');
    expect(state).toMatchObject({
      family: 'wilink',
      model: 'kingsmith.treadmill.k15',
      link: { phase: 'linked', holderName: 'Owner phone', holderIsYou: true },
      limits: { minKmh: 1, maxKmh: 15, stepKmh: 0.1, capKmh: null, remoteCapKmh: null },
      start: { allowed: true, reason: null },
      mayConfigure: true,
      bodyVisible: true,
    });
  });

  it('tells a member who is not on the holder phone why they cannot start', () => {
    rig.batch(1, [statusHex({ state: IDLE })]);
    const state = only(read(rig.member, { view: 'state' }), 'state');
    expect(state.start.allowed).toBe(false);
    expect(state.start.reason).toContain('holds the link');
    expect(state.mayConfigure).toBe(false);
    expect(state.bodyVisible).toBe(false);
    expect(state.frame.body).toBeNull();
  });

  it('shows no fault until the pad reports one, and then the cause with the power-off tip', () => {
    rig.batch(1, [statusHex({ state: 4 })]);
    const state = only(read(rig.owner, { view: 'state' }), 'state');
    expect(state.fault).toMatchObject({ code: 'E??' });
    expect(state.fault?.tip).toContain('ten minutes');
  });

  it('counts the days until the belt wants oil and the distance walked since', () => {
    walk(rig.owner, 1);
    const maintenance = only(read(rig.owner, { view: 'state' }), 'state').maintenance;
    expect(maintenance.lubricatedAt).toBeNull();
    expect(maintenance.dueInDays).toBeGreaterThan(80);
    expect(maintenance.beltKmSince).toBeGreaterThan(0);
  });
});

describe('sessions are private to the walker and the owner', () => {
  beforeEach(() => {
    walk(rig.owner, 1);
    walk(rig.member, 100);
  });

  it('lists every session for the owner and only their own for a member', () => {
    expect(only(read(rig.owner, { view: 'sessions' }), 'sessions').sessions).toHaveLength(2);
    const own = only(read(rig.member, { view: 'sessions' }), 'sessions').sessions;
    expect(own).toHaveLength(1);
    expect(own[0]?.walkerProfileId).toBe(rig.member.profile.id);
  });

  it('lets the owner pick one person and keeps a member from picking anyone else', () => {
    const picked = only(
      read(rig.owner, { view: 'sessions', personId: rig.member.profile.id }),
      'sessions',
    );
    expect(picked.sessions).toHaveLength(1);
    expect(() => read(rig.member, { view: 'sessions', personId: rig.owner.profile.id })).toThrow(
      ApiError,
    );
  });

  it('pages newest first and says when there is more', () => {
    const first = only(read(rig.owner, { view: 'sessions', limit: 1 }), 'sessions');
    expect(first).toMatchObject({ more: true });
    expect(first.sessions[0]?.walkerProfileId).toBe(rig.member.profile.id);
    const next = only(
      read(rig.owner, { view: 'sessions', limit: 1, before: first.sessions[0]?.startedAt }),
      'sessions',
    );
    expect(next.sessions[0]?.walkerProfileId).toBe(rig.owner.profile.id);
    expect(next.more).toBe(false);
  });

  it('opens a session with its speed profile for the walker and refuses everyone else', () => {
    const [mine] = only(read(rig.member, { view: 'sessions' }), 'sessions').sessions;
    const detail = only(read(rig.member, { view: 'session', sessionId: mine?.id }), 'session');
    expect(detail.walkerName).toBe('Kid');
    expect(detail.detail.profile.length).toBeGreaterThan(10);
    expect(detail.detail.segments.length).toBeGreaterThan(0);
    expect(detail.detail.paceSecondsPerKm).toBeCloseTo(3600 / detail.detail.session.avgKmh, 5);
    const [others] = only(
      read(rig.owner, { view: 'sessions', personId: rig.owner.profile.id }),
      'sessions',
    ).sessions;
    expect(() => read(rig.member, { view: 'session', sessionId: others?.id })).toThrow(
      'another person',
    );
    expect(() => read(rig.owner, { view: 'session' })).toThrow('sessionId');
  });

  it('works out statistics for a person and shows them nobody else’s', () => {
    const stats = only(read(rig.member, { view: 'stats', range: 'week' }), 'stats');
    expect(stats.profileId).toBe(rig.member.profile.id);
    expect(stats.stats.totals.sessions).toBe(1);
    expect(stats.today.sessions).toBe(1);
    expect(stats.goals.dailyMinutes).toBe(30);
    expect(() => read(rig.member, { view: 'stats', personId: rig.owner.profile.id })).toThrow(
      'Only the owner',
    );
    expect(
      only(read(rig.owner, { view: 'stats', personId: rig.member.profile.id }), 'stats').stats
        .totals.sessions,
    ).toBe(1);
  });
});

describe('settings, records and diagnostics', () => {
  it('hides the owner’s settings from a member and gives them their own goals', () => {
    const member = only(read(rig.member, { view: 'settings' }), 'settings');
    expect(member).toMatchObject({ settings: null, pad: null, mayConfigure: false });
    expect(member.goals.dailyMinutes).toBe(30);
    const owner = only(read(rig.owner, { view: 'settings' }), 'settings');
    expect(owner.settings?.policy.remoteStart).toBe(false);
    expect(owner.mayConfigure).toBe(true);
  });

  it('reads the diagnostics for the owner only', () => {
    expect(only(read(rig.owner, { view: 'diagnostics' }), 'diagnostics')).toMatchObject({
      family: 'wilink',
      rawLog: { enabled: false, frames: [] },
    });
    expect(() => read(rig.member, { view: 'diagnostics' })).toThrow('Only the owner');
  });

  it('shows no pad records before any were read', () => {
    expect(only(read(rig.owner, { view: 'records' }), 'records')).toMatchObject({
      remaining: null,
      records: [],
    });
  });
});

describe('the incline in the state view', () => {
  it('carries the incline limits from the belt, and the scale', () => {
    const state = only(read(rig.owner, { view: 'state' }), 'state');
    expect(state.inclineScale).toBe('unconfirmed');
    expect(state.frame.belt.inclineScale).toBe('unconfirmed');
    expect(state.frame.belt.inclinePercent).toBeNull();
  });
});

describe('acting on a treadmill', () => {
  function actions(): ActDeps {
    return {
      store: rig.test.store,
      fleet: rig.fleet,
      local: { observe: (): Promise<void> => Promise.resolve() },
      bridges: {
        takeOver: (_device, client): Promise<WatchBridge> => {
          takeOvers.push(client.id);
          return Promise.resolve({
            clientId: client.id,
            clientName: client.name,
            since: '2026-10-18T10:00:00.000Z',
          });
        },
      },
      health: new TreadmillHealth(rig.test.store),
      broker: { run: () => Promise.resolve({ ok: true, detail: 'Done.' }) },
      holderOf: () => null,
      now: rig.clock.now,
      log: testLogger('treadmill'),
    };
  }

  it('lets only the owner change the settings, and merges what changed', async () => {
    await expect(
      actTreadmill(actions(), rig.row(), actor(rig.member), {
        action: 'configure',
        settings: { gradePercent: 2 },
      }),
    ).rejects.toThrow('Only the owner');
    await actTreadmill(actions(), rig.row(), actor(rig.owner), {
      action: 'configure',
      settings: { gradePercent: 2, policy: { remoteStart: true, remoteMaxKmh: 4 } },
    });
    const settings = only(read(rig.owner, { view: 'settings' }), 'settings').settings;
    expect(settings).toMatchObject({
      gradePercent: 2,
      runSwitchKmh: 8,
      policy: { remoteStart: true, remoteMaxKmh: 4, remoteWho: 'owner', stopWithoutSteps: true },
    });
  });

  it('keeps each person’s goals and lets only the owner set another person’s', async () => {
    await actTreadmill(actions(), rig.row(), actor(rig.member), {
      action: 'set_goal',
      goals: { dailyMinutes: 15, weeklyKm: 5 },
    });
    expect(only(read(rig.member, { view: 'settings' }), 'settings').goals).toMatchObject({
      dailyMinutes: 15,
      weeklyKm: 5,
      weeklySessions: 5,
    });
    await expect(
      actTreadmill(actions(), rig.row(), actor(rig.member), {
        action: 'set_goal',
        personId: rig.owner.profile.id,
        goals: { dailyMinutes: 1 },
      }),
    ).rejects.toThrow('Only the owner');
    await actTreadmill(actions(), rig.row(), actor(rig.owner), {
      action: 'set_goal',
      personId: rig.member.profile.id,
      goals: { dailyMinutes: 20 },
    });
    expect(only(read(rig.member, { view: 'settings' }), 'settings').goals.dailyMinutes).toBe(20);
  });

  it('marks the belt as oiled and resets the countdown', async () => {
    await actTreadmill(actions(), rig.row(), actor(rig.owner), { action: 'mark_lubricated' });
    const maintenance = only(read(rig.owner, { view: 'state' }), 'state').maintenance;
    expect(maintenance.lubricatedAt).toBe(rig.clock.now().toISOString());
    expect(maintenance.dueInDays).toBe(90);
  });

  it('hands a session and its health records to another walker', async () => {
    walk(rig.owner, 1);
    const [session] = only(read(rig.owner, { view: 'sessions' }), 'sessions').sessions;
    const window = {
      types: ['ExerciseSession' as const],
      from: '2026-10-18T00:00:00.000Z',
      to: '2026-10-19T00:00:00.000Z',
    };
    expect(rig.test.store.health.records(window, rig.owner.profile.id)).toHaveLength(1);
    await actTreadmill(actions(), rig.row(), actor(rig.owner), {
      action: 'assign_walker',
      sessionId: session?.id ?? '',
      personId: rig.member.profile.id,
    });
    expect(rig.test.store.health.records(window, rig.owner.profile.id)).toHaveLength(0);
    expect(rig.test.store.health.records(window, rig.member.profile.id)).toHaveLength(1);
    expect(rig.test.store.treadmillSessions.byId(session?.id ?? '').walkerProfileId).toBe(
      rig.member.profile.id,
    );
  });

  it('forgets a session and its health records, for its walker or the owner', async () => {
    walk(rig.member, 1);
    const [session] = only(read(rig.member, { view: 'sessions' }), 'sessions').sessions;
    await expect(
      actTreadmill(actions(), rig.row(), actor({ ...rig.owner, profile: rig.owner.profile }), {
        action: 'forget_session',
        sessionId: session?.id ?? '',
      }),
    ).resolves.toMatchObject({ ok: true });
    expect(rig.test.store.treadmillSessions.find(session?.id ?? '')).toBeUndefined();
    expect(
      rig.test.store.health.records(
        {
          types: ['ExerciseSession'],
          from: '2026-10-18T00:00:00.000Z',
          to: '2026-10-19T00:00:00.000Z',
        },
        rig.member.profile.id,
      ),
    ).toHaveLength(0);
  });

  it('keeps a member away from another person’s session', async () => {
    walk(rig.owner, 1);
    const [session] = only(read(rig.owner, { view: 'sessions' }), 'sessions').sessions;
    await expect(
      actTreadmill(actions(), rig.row(), actor(rig.member), {
        action: 'forget_session',
        sessionId: session?.id ?? '',
      }),
    ).rejects.toThrow('another person');
  });

  it('switches the raw frame log on for the owner and records what the belt sends', async () => {
    await actTreadmill(actions(), rig.row(), actor(rig.owner), {
      action: 'raw_log',
      enabled: true,
    });
    rig.batch(1, [statusHex({ state: IDLE })]);
    const log = only(read(rig.owner, { view: 'diagnostics' }), 'diagnostics').rawLog;
    expect(log.enabled).toBe(true);
    expect(log.frames).toHaveLength(1);
    await actTreadmill(actions(), rig.row(), actor(rig.owner), {
      action: 'raw_log',
      enabled: false,
    });
    expect(only(read(rig.owner, { view: 'diagnostics' }), 'diagnostics').rawLog.frames).toEqual([]);
    await expect(
      actTreadmill(actions(), rig.row(), actor(rig.member), { action: 'raw_log', enabled: true }),
    ).rejects.toThrow('Only the owner');
  });

  it('puts someone on the belt and lets a person take the link', async () => {
    await actTreadmill(actions(), rig.row(), actor(rig.member), {
      action: 'set_walker',
      personId: rig.member.profile.id,
    });
    await expect(
      actTreadmill(actions(), rig.row(), actor(rig.member), {
        action: 'set_walker',
        personId: rig.owner.profile.id,
      }),
    ).rejects.toThrow('Only the owner');
    const taken = await actTreadmill(actions(), rig.row(), actor(rig.member), {
      action: 'take_over',
    });
    expect(taken.detail).toContain('Kid phone');
    expect(takeOvers).toEqual([rig.member.client.id]);
  });

  it('refuses a take over from the assistant or a computer, so the phone keeps the link', async () => {
    await expect(
      actTreadmill(actions(), rig.row(), actor(rig.owner, false), { action: 'take_over' }),
    ).rejects.toThrow('Only a phone next to the treadmill');
    expect(takeOvers).toEqual([]);
  });

  it('keeps the records stored on the belt from a member', () => {
    expect(() => read(rig.member, { view: 'records' })).toThrow('Only the owner');
  });
});
