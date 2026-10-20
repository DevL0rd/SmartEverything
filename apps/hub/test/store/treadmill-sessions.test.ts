import type { TreadmillSession } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DevicesRepository } from '../../src/store/repositories/devices';
import { ProfilesRepository } from '../../src/store/repositories/profiles';
import { TreadmillSessionsRepository } from '../../src/store/repositories/treadmill-sessions';
import { sweepRetention } from '../../src/store/retention';
import { countedStore, type CountedStore } from '../support/counted-store';
import { captureLogs } from '../support/logs';

let counted: CountedStore;
let sessions: TreadmillSessionsRepository;
let deviceId: string;
let ownerId: string;
let memberId: string;

beforeEach(async () => {
  captureLogs();
  counted = await countedStore();
  const { context } = counted;
  const profiles = new ProfilesRepository(context);
  ownerId = profiles.first().id;
  memberId = profiles.create({ name: 'Kid' }).id;
  const [device] = new DevicesRepository(context).upsert([
    {
      provider: 'local',
      externalId: 'kingsmith_treadmill:AA:BB:CC:DD:EE:01',
      parentId: null,
      kind: 'appliance',
      name: 'Walking pad',
      model: 'kingsmith.treadmill.k15',
      manufacturer: 'kingsmith',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  deviceId = device?.id ?? '';
  sessions = new TreadmillSessionsRepository(context);
});

afterEach(async () => {
  await counted.close();
});

function session(id: string, over: Partial<TreadmillSession> = {}): TreadmillSession {
  return {
    id,
    deviceId: deviceId,
    walkerProfileId: ownerId,
    startedAt: '2026-10-18T07:00:00.000Z',
    endedAt: '2026-10-18T07:30:00.000Z',
    zoneOffsetSeconds: 0,
    activeSeconds: 1800,
    pausedSeconds: 0,
    distanceM: 2400,
    steps: 3300,
    kcal: 140,
    kcalNet: 90,
    avgKmh: 4.8,
    maxKmh: 5.5,
    mode: 'manual',
    kind: 'walk',
    zones: { walk: 1800, jog: 0, run: 0 },
    splits: [750, 740],
    source: 'live',
    climbM: null,
    inclineAvg: null,
    inclineMax: null,
    inclineSeconds: {},
    kcalSource: null,
    kcalEstimate: null,
    heartRateSource: null,
    ...over,
  };
}

describe('the treadmill session store', () => {
  it('keeps an open session apart from finished ones until it is saved as finished', () => {
    sessions.open(session('s1'));
    expect(sessions.openIds()).toEqual(['s1']);
    expect(sessions.finished(deviceId, undefined)).toEqual([]);
    sessions.save(session('s1', { distanceM: 2500 }), true);
    expect(sessions.openIds()).toEqual([]);
    expect(sessions.byId('s1')).toMatchObject({
      distanceM: 2500,
      endedAt: '2026-10-18T07:30:00.000Z',
    });
  });

  it('pages a walker’s sessions newest first and filters by walker', () => {
    sessions.add(session('a', { startedAt: '2026-10-16T07:00:00.000Z' }));
    sessions.add(session('b', { startedAt: '2026-10-17T07:00:00.000Z' }));
    sessions.add(
      session('c', { startedAt: '2026-10-18T07:00:00.000Z', walkerProfileId: memberId }),
    );
    const owners = sessions.page({
      deviceId: deviceId,
      walkerProfileId: ownerId,
      before: undefined,
      limit: 10,
    });
    expect(owners.map((entry) => entry.id)).toEqual(['b', 'a']);
    const older = sessions.page({
      deviceId: deviceId,
      walkerProfileId: undefined,
      before: '2026-10-18T00:00:00.000Z',
      limit: 1,
    });
    expect(older.map((entry) => entry.id)).toEqual(['b']);
    expect(sessions.finished(deviceId, null)).toEqual([]);
  });

  it('stores samples at centi-kilometres per hour, replaces a second and reads the last second', () => {
    sessions.add(session('s1'));
    sessions.appendSamples('s1', [
      { t: 0, kmh: 3.04, distanceM: 0, steps: 0, incline: 6, state: 'running' },
      { t: 1, kmh: 3.1, distanceM: 1, steps: 2, incline: 6, state: 'running' },
      { t: 1, kmh: 3.2, distanceM: 1, steps: 2, incline: null, state: 'paused' },
    ]);
    expect(sessions.samples('s1')).toEqual([
      { t: 0, kmh: 3.04, distanceM: 0, steps: 0, incline: 6, state: 'running' },
      { t: 1, kmh: 3.2, distanceM: 1, steps: 2, incline: null, state: 'paused' },
    ]);
    expect(sessions.lastSampleSecond('s1')).toBe(1);
    expect(sessions.lastSampleSecond('none')).toBeNull();
  });

  it('gives a session to another walker, adds up the distance since a moment and forgets with its samples', () => {
    sessions.add(session('a', { startedAt: '2026-10-10T07:00:00.000Z', distanceM: 1000 }));
    sessions.add(session('b', { startedAt: '2026-10-18T07:00:00.000Z', distanceM: 2000 }));
    sessions.appendSamples('b', [
      { t: 0, kmh: 3, distanceM: 0, steps: null, incline: null, state: 'running' },
    ]);
    expect(sessions.distanceSince(deviceId, null)).toBe(3000);
    expect(sessions.distanceSince(deviceId, '2026-10-15T00:00:00.000Z')).toBe(2000);
    sessions.reassign('b', memberId);
    expect(sessions.byId('b').walkerProfileId).toBe(memberId);
    sessions.remove('b');
    expect(sessions.find('b')).toBeUndefined();
    expect(sessions.samples('b')).toEqual([]);
  });

  it('forgets the samples of sessions older than 400 days but keeps the sessions', () => {
    sessions.add(
      session('old', {
        startedAt: '2025-08-01T07:00:00.000Z',
        endedAt: '2025-08-01T07:30:00.000Z',
      }),
    );
    sessions.add(session('new'));
    for (const id of ['old', 'new']) {
      sessions.appendSamples(id, [
        { t: 0, kmh: 3, distanceM: 0, steps: null, incline: null, state: 'running' },
      ]);
    }
    const swept = sweepRetention(counted.sql, new Date('2026-10-18T12:00:00.000Z'));
    expect(swept['treadmill_samples']).toBe(1);
    expect(sessions.samples('old')).toEqual([]);
    expect(sessions.samples('new')).toHaveLength(1);
    expect(sessions.find('old')).toBeDefined();
  });
});
