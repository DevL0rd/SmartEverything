import { randomUUID } from 'node:crypto';
import { HEALTH_RECORD, NODE_REGISTRY, type HealthRecord } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { withExecutionAuthority } from '../../../src/assistant/turn-authority';
import type { ConversationAuthority } from '../../../src/harness/authority-contract';
import { coreNodeReadHandlers } from '../../../src/automations/world-v3/core-node-reads';
import { millilitresOf } from '../../../src/automations/world-v3/health-reads';
import { ReadFailure } from '../../../src/automations/world-v3/read-port';
import { furnish, type Home } from './support';

const SOURCE = { device: 'Pixel', appVersion: '1.0' } as const;

let home: Home;
let owner: string;
let ann: string;

beforeEach(async () => {
  home = await furnish();
  owner = home.test.store.profiles.first().id;
  ann = home.test.store.profiles.create({ name: 'Ann' }).id;
});

afterEach(async () => {
  await home.test.close();
});

function record(recordId: string, fields: Readonly<Record<string, unknown>>): HealthRecord {
  return HEALTH_RECORD.parse({
    zoneOffsetSeconds: 0,
    sourceApp: 'com.mi.health',
    lastModified: '2026-10-18T11:00:00Z',
    recordId,
    ...fields,
  });
}

function steps(recordId: string, day: string, count: number): HealthRecord {
  return record(recordId, {
    type: 'Steps',
    startTime: `${day}T06:00:00Z`,
    endTime: `${day}T07:00:00Z`,
    data: { count },
  });
}

function ingest(profile: string, records: readonly HealthRecord[]): void {
  home.test.store.health.ingest(
    {
      records: [...records],
      deletions: [],
      grantedTypes: [...new Set(records.map((each) => each.type))],
      source: SOURCE,
    },
    profile,
  );
}

function today(person: string): Readonly<Record<string, unknown>> {
  return home.read('health.today', { person: { person } }).outputs;
}

function range(person: string, metric: string, days?: number): Readonly<Record<string, unknown>> {
  return home.read('health.range', {
    person: { person },
    metric,
    ...(days === undefined ? {} : { days }),
  }).outputs;
}

function failure(work: () => unknown): ReadFailure {
  try {
    work();
  } catch (cause) {
    if (cause instanceof ReadFailure) return cause;
    throw cause;
  }
  throw new Error('the read did not fail');
}

function authority(profileId: string, role: 'owner' | 'member'): ConversationAuthority {
  return {
    event_id: randomUUID(),
    profile_id: profileId,
    client_id: null,
    kind: 'service',
    role,
    hub_os_ban: false,
    tools: null,
    plugin_id: null,
    requester: null,
  };
}

function ownersDay(): void {
  ingest(owner, [
    steps('s1', '2026-10-18', 6000),
    record('c1', {
      type: 'ActiveCaloriesBurned',
      startTime: '2026-10-18T06:00:00Z',
      endTime: '2026-10-18T07:00:00Z',
      data: { kilocalories: 450 },
    }),
    record('e1', {
      type: 'ExerciseSession',
      startTime: '2026-10-18T08:00:00Z',
      endTime: '2026-10-18T08:40:00Z',
      data: {
        exerciseType: 57,
        title: null,
        notes: null,
        plannedExerciseSessionId: null,
        segments: [],
        laps: [],
        route: { status: 'absent' },
      },
    }),
    record('z1', {
      type: 'SleepSession',
      startTime: '2026-10-17T22:00:00Z',
      endTime: '2026-10-18T06:00:00Z',
      data: { title: null, notes: null, stages: [] },
    }),
    record('h1', {
      type: 'Hydration',
      startTime: '2026-10-18T09:00:00Z',
      endTime: '2026-10-18T09:01:00Z',
      data: { liters: 1.5 },
    }),
  ]);
}

describe('registration', () => {
  it('registers both reads as read handlers of the core node reads', () => {
    expect(Object.keys(coreNodeReadHandlers(home.deps))).toEqual(
      expect.arrayContaining(['health.today', 'health.range']),
    );
  });
});

describe('health.today', () => {
  it('reports the figures of today with sleep as a duration and water in millilitres', () => {
    ownersDay();
    expect(today(owner)).toEqual({
      day: '2026-10-18',
      steps: 6000,
      energy: 450,
      sleep: 480 * 60_000,
      water: 1500,
      goalsMet: 2,
      goalsTotal: 5,
    });
  });

  it('counts a goal as met exactly at the goal and not below it', () => {
    ingest(owner, [steps('s1', '2026-10-18', 10_000)]);
    expect(today(owner)['goalsMet']).toBe(1);
    ingest(owner, [
      record('s1', {
        type: 'Steps',
        startTime: '2026-10-18T06:00:00Z',
        endTime: '2026-10-18T07:00:00Z',
        data: { count: 9999 },
        lastModified: '2026-10-18T11:30:00Z',
      }),
    ]);
    expect(today(owner)['goalsMet']).toBe(0);
  });

  it('leaves a figure nobody recorded empty and counts its goal as not met', () => {
    expect(today(owner)).toEqual({ day: '2026-10-18', goalsMet: 0, goalsTotal: 5 });
  });

  it('reads each person on their own figures and their own goals', () => {
    ownersDay();
    ingest(ann, [steps('a1', '2026-10-18', 12_000)]);
    home.test.store.profiles.updateFitness(ann, { goals: { steps: 12_000 } });
    expect(today(ann)).toEqual({ day: '2026-10-18', steps: 12_000, goalsMet: 1, goalsTotal: 5 });
    expect(today(owner)['steps']).toBe(6000);
  });

  it('uses the day at home, which can be a day ahead of UTC', () => {
    home.test.store.settings.updateHome({ time_zone: 'Pacific/Auckland' });
    ingest(owner, [steps('s1', '2026-10-19', 700)]);
    expect(today(owner)).toMatchObject({ day: '2026-10-19', steps: 700 });
  });

  it('turns litres into whole millilitres without floating point residue', () => {
    expect(millilitresOf(1.9999999999999998)).toBe(2000);
    expect(millilitresOf(0.07)).toBe(70);
    expect(millilitresOf(0.2505)).toBe(250.5);
  });

  it('fails with NotFound for a person who does not exist and Invalid for bad inputs', () => {
    expect(failure(() => today(randomUUID()))).toMatchObject({ errorClass: 'NotFound' });
    expect(failure(() => home.read('health.today', {}))).toMatchObject({ errorClass: 'Invalid' });
  });
});

describe('health.range', () => {
  beforeEach(() => {
    ingest(owner, [
      steps('s10', '2026-10-10', 800),
      steps('s14', '2026-10-14', 1000),
      steps('s16', '2026-10-16', 3000),
      steps('s18', '2026-10-18', 5000),
    ]);
    ingest(ann, [steps('a16', '2026-10-16', 99_000)]);
  });

  it('lists the days that have a figure oldest first with their dates, count and average', () => {
    expect(range(owner, 'steps', 5)).toEqual({
      values: [1000, 3000, 5000],
      dates: ['2026-10-14', '2026-10-16', '2026-10-18'],
      count: 3,
      average: 3000,
      unit: 'count',
    });
  });

  it('counts today and the days before it, so a shorter window drops the older days', () => {
    expect(range(owner, 'steps', 3)).toMatchObject({ values: [3000, 5000], average: 4000 });
    expect(range(owner, 'steps', 1)).toMatchObject({ values: [5000], average: 5000 });
  });

  it('looks back the declared default of days when days is not given', () => {
    const declared = NODE_REGISTRY.get('health.range')?.inputs.find((port) => port.name === 'days');
    expect(declared?.default).toBe(7);
    expect(range(owner, 'steps')['dates']).toEqual(['2026-10-14', '2026-10-16', '2026-10-18']);
    expect(range(owner, 'steps', 9)['dates']).toEqual([
      '2026-10-10',
      '2026-10-14',
      '2026-10-16',
      '2026-10-18',
    ]);
  });

  it('has no upper limit on the days', () => {
    ingest(owner, [steps('old', '2021-06-01', 42)]);
    expect(range(owner, 'steps', 3650)).toMatchObject({ count: 5 });
    expect(range(owner, 'steps', 3650)['values']).toEqual([42, 800, 1000, 3000, 5000]);
  });

  it('reads only the asked person and leaves the average empty when no day has a figure', () => {
    expect(range(ann, 'steps', 7)).toMatchObject({ values: [99_000], average: 99_000 });
    expect(range(owner, 'weight', 7)).toEqual({ values: [], dates: [], count: 0, unit: 'kg' });
  });

  it('fails with Invalid for an unknown metric or fewer than one day', () => {
    expect(failure(() => range(owner, 'luck', 3))).toMatchObject({ errorClass: 'Invalid' });
    expect(failure(() => range(owner, 'steps', 0))).toMatchObject({ errorClass: 'Invalid' });
  });
});

describe('who may read whose health', () => {
  it('lets a member read their own figures and refuses anyone else’s', () => {
    ownersDay();
    ingest(ann, [steps('a1', '2026-10-18', 1234)]);
    const asAnn = <T>(work: () => T): T => withExecutionAuthority(authority(ann, 'member'), work);
    expect(asAnn(() => today(ann))['steps']).toBe(1234);
    expect(asAnn(() => range(ann, 'steps', 3))['values']).toEqual([1234]);
    expect(failure(() => asAnn(() => today(owner)))).toMatchObject({ errorClass: 'Forbidden' });
    expect(failure(() => asAnn(() => range(owner, 'steps', 3)))).toMatchObject({
      errorClass: 'Forbidden',
    });
  });

  it('refuses a member whose access leaves health out, even for themselves', () => {
    const { store } = home.test;
    const scopes = store.personAccess.scopes(ann);
    if (scopes === undefined) throw new Error('Ann has no access row');
    store.personAccess.change(ann, {
      scopes: { ...scopes, areas: scopes.areas.filter((area) => area !== 'health') },
    });
    expect(
      failure(() => withExecutionAuthority(authority(ann, 'member'), () => today(ann))),
    ).toMatchObject({ errorClass: 'Forbidden' });
  });

  it('lets an owner automation read any person', () => {
    ingest(ann, [steps('a1', '2026-10-18', 1234)]);
    expect(withExecutionAuthority(authority(owner, 'owner'), () => today(ann))['steps']).toBe(1234);
  });
});
