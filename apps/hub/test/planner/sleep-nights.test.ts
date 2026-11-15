import { randomUUID } from 'node:crypto';
import {
  HEALTH_RECORD,
  PLANNER_DAY,
  PLANNER_SLEEP,
  triggerCatalogue,
  type HealthRecord,
} from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { FeedRegistry } from '../../src/planner/feeds/registry';
import { plannerPreferencesOf } from '../../src/planner/preferences';
import { clustersOf, nightsOf, readSleep } from '../../src/planner/sleep-nights';
import type { Caller } from '../../src/server/auth';
import { plannerCoreRoutes } from '../../src/server/handlers/planner';
import { plannerBedtimeRoutes } from '../../src/server/handlers/planner-bedtime';
import type { Bound } from '../../src/server/router';
import { testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const SOURCE = { device: 'Pixel', appVersion: '1.0' } as const;
const NOW = new Date('2026-11-10T08:00:00.000Z');

let test: TestStore;
let ann: TestPerson;
let bob: TestPerson;

beforeEach(async () => {
  test = await testStore();
  ann = addPerson(test, 'Ann', 'owner');
  bob = addPerson(test, 'Bob', 'member');
});

afterEach(async () => {
  await test.close();
});

function session(
  startTime: string,
  endTime: string,
  stages: readonly { readonly start: string; readonly end: string; readonly stage: number }[] = [],
  sourceApp = 'com.mi.health',
): HealthRecord {
  return HEALTH_RECORD.parse({
    zoneOffsetSeconds: 0,
    sourceApp,
    lastModified: '2026-11-10T07:00:00Z',
    recordId: randomUUID(),
    type: 'SleepSession',
    startTime,
    endTime,
    data: {
      title: null,
      notes: null,
      stages: stages.map((stage) => ({
        startTime: stage.start,
        endTime: stage.end,
        stage: stage.stage,
      })),
    },
  });
}

function ingest(person: TestPerson, records: readonly HealthRecord[]): void {
  test.store.health.ingest(
    {
      records: [...records],
      deletions: [],
      grantedTypes: ['SleepSession'],
      source: SOURCE,
    },
    person.profileId,
  );
}

const range = (
  from: string,
  to: string,
): { profileId: string; from: string; to: string; timeZone: string } => ({
  profileId: ann.profileId,
  from,
  to,
  timeZone: 'UTC',
});

describe('sleep nights', () => {
  it('reports each night by the day it ended with the minutes asleep', () => {
    ingest(ann, [
      session('2026-11-08T22:30:00Z', '2026-11-09T06:30:00Z'),
      session('2026-11-09T23:00:00Z', '2026-11-10T07:00:00Z'),
    ]);
    const sleep = readSleep(test.store, range('2026-11-08T00:00:00Z', '2026-11-10T08:00:00Z'));
    expect(sleep.nights).toEqual([
      {
        date: '2026-11-09',
        bed_at: '2026-11-08T22:30:00.000Z',
        woke_at: '2026-11-09T06:30:00.000Z',
        asleep_minutes: 480,
      },
      {
        date: '2026-11-10',
        bed_at: '2026-11-09T23:00:00.000Z',
        woke_at: '2026-11-10T07:00:00.000Z',
        asleep_minutes: 480,
      },
    ]);
  });

  it('counts only the asleep stages when the session has stages', () => {
    ingest(ann, [
      session('2026-11-09T23:00:00Z', '2026-11-10T07:00:00Z', [
        { start: '2026-11-09T23:00:00Z', end: '2026-11-09T23:30:00Z', stage: 1 },
        { start: '2026-11-09T23:30:00Z', end: '2026-11-10T07:00:00Z', stage: 5 },
      ]),
    ]);
    const sleep = readSleep(test.store, range('2026-11-10T00:00:00Z', '2026-11-10T08:00:00Z'));
    expect(sleep.nights[0]?.asleep_minutes).toBe(450);
  });

  it('joins a night broken by a short wake and keeps a daytime nap apart', () => {
    ingest(ann, [
      session('2026-11-09T23:00:00Z', '2026-11-10T03:00:00Z'),
      session('2026-11-10T03:40:00Z', '2026-11-10T06:40:00Z'),
      session('2026-11-10T14:00:00Z', '2026-11-10T14:30:00Z'),
    ]);
    const clusters = clustersOf(
      test.store.health.records(
        { types: ['SleepSession'], from: '2026-11-09T00:00:00Z', to: '2026-11-11T00:00:00Z' },
        ann.profileId,
      ),
    );
    expect(clusters).toHaveLength(2);
    const nights = nightsOf(clusters, 'UTC');
    expect(nights).toHaveLength(1);
    expect(nights[0]).toMatchObject({
      date: '2026-11-10',
      bed_at: '2026-11-09T23:00:00.000Z',
      woke_at: '2026-11-10T06:40:00.000Z',
      asleep_minutes: 420,
    });
  });

  it('does not double count the same night from two apps', () => {
    ingest(ann, [
      session('2026-11-09T23:00:00Z', '2026-11-10T07:00:00Z', [], 'com.mi.health'),
      session('2026-11-09T23:05:00Z', '2026-11-10T07:05:00Z', [], 'com.other.sleep'),
    ]);
    const sleep = readSleep(test.store, range('2026-11-10T00:00:00Z', '2026-11-10T08:00:00Z'));
    expect(sleep.nights).toHaveLength(1);
    expect(sleep.nights[0]?.asleep_minutes).toBe(480);
  });

  it('averages the seven days up to the end of the range', () => {
    ingest(ann, [
      session('2026-11-01T23:00:00Z', '2026-11-02T05:00:00Z'),
      session('2026-11-08T23:00:00Z', '2026-11-09T05:00:00Z'),
      session('2026-11-09T23:00:00Z', '2026-11-10T07:00:00Z'),
    ]);
    const sleep = readSleep(test.store, range('2026-11-10T00:00:00Z', '2026-11-10T08:00:00Z'));
    expect(sleep.nights).toHaveLength(1);
    expect(sleep.week_average_minutes).toBe(420);
  });

  it('gives no nights and no average without sleep data', () => {
    const sleep = readSleep(test.store, range('2026-11-10T00:00:00Z', '2026-11-10T08:00:00Z'));
    expect(sleep).toEqual({ nights: [], week_average_minutes: null });
  });

  it('keeps the data of one person away from another', () => {
    ingest(ann, [session('2026-11-09T23:00:00Z', '2026-11-10T07:00:00Z')]);
    const sleep = readSleep(test.store, {
      ...range('2026-11-10T00:00:00Z', '2026-11-10T08:00:00Z'),
      profileId: bob.profileId,
    });
    expect(sleep.nights).toEqual([]);
  });
});

const as = (person: TestPerson): Caller => ({ kind: 'client', client: person.client });

const call = (
  route: Bound,
  person: TestPerson,
  raw: { query?: unknown; body?: unknown } = {},
): Promise<unknown> =>
  route.run(
    as(person),
    { params: {}, query: {}, body: undefined, remote: 'test', headers: {}, ...raw },
    testLogger(),
  );

describe('sleep in the routes', () => {
  it('answers the sleep read for the person who asks', async () => {
    ingest(ann, [session('2026-11-09T23:00:00Z', '2026-11-10T07:00:00Z')]);
    const routes = plannerBedtimeRoutes(
      { store: test.store },
      { sleepSound: { play: () => Promise.resolve(1), stop: () => Promise.resolve(1) } },
    );
    const reply = PLANNER_SLEEP.parse(
      await call(routes.readPlannerSleep, ann, {
        query: { from: '2026-11-10T00:00:00Z', to: '2026-11-10T08:00:00Z' },
      }),
    );
    expect(reply.nights.map((night) => night.asleep_minutes)).toEqual([480]);
    expect(reply.week_average_minutes).toBe(480);
  });

  it('draws the night on the day strip as sleep', async () => {
    ingest(ann, [session('2026-11-09T23:00:00Z', '2026-11-10T07:00:00Z')]);
    const core = plannerCoreRoutes(
      { store: test.store },
      {
        now: () => NOW,
        preferencesOf: (profileId) => plannerPreferencesOf(test.store, profileId),
        catalogueOf: () =>
          triggerCatalogue([], { devices: [], rooms: [], people: [], chats: [] }, []),
        feeds: { registry: new FeedRegistry() },
      },
    );
    const day = PLANNER_DAY.parse(
      await call(core.readPlannerDay, ann, { query: { date: '2026-11-10' } }),
    );
    const sleep = day.strip.filter((segment) => segment.kind === 'sleep');
    expect(sleep).toHaveLength(1);
    expect(sleep[0]?.to).toBe('2026-11-10T07:00:00.000Z');
  });

  it('sends the sleep sound command of the person and tells when no phone answered', async () => {
    const sent: unknown[] = [];
    const routes = plannerBedtimeRoutes(
      { store: test.store },
      {
        sleepSound: {
          play: (profileId, request) => {
            sent.push({ profileId, request });
            return Promise.resolve(0);
          },
          stop: () => Promise.resolve(1),
        },
      },
    );
    await expect(
      call(routes.playPlannerSleepSound, ann, {
        body: { action: 'play', sound: { kind: 'noise', colour: 'pink' }, timer_minutes: 30 },
      }),
    ).rejects.toMatchObject({ code: 'command_refused' });
    expect(sent).toEqual([
      {
        profileId: ann.profileId,
        request: {
          sound: { kind: 'noise', colour: 'pink' },
          timerMinutes: 30,
          fadeSeconds: undefined,
          clientId: undefined,
        },
      },
    ]);
    await expect(
      call(routes.playPlannerSleepSound, ann, { body: { action: 'stop' } }),
    ).resolves.toEqual({ ok: true });
  });
});
