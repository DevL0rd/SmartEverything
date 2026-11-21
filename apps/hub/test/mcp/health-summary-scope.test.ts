import { HEALTH_RECORD, type ClientRow, type ProfileRow } from '@smarteverything/domain';
import { z } from 'zod';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { homesOf } from '../../src/extensions/mcp/tools/home';
import { healthSummary } from '../../src/extensions/mcp/tools/health-summary';
import type { Caller } from '../../src/server/auth';
import { captureLogs } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const HOMES = z.object({ homes: z.array(z.object({ role: z.string() })) });

const RANGE = { from: '2026-10-08', to: '2026-10-08', records: false } as const;

let opened: TestStore;
let ownerProfile: ProfileRow;
let memberProfile: ProfileRow;
let owner: ClientRow;
let member: ClientRow;

function steps(count: number): ReturnType<typeof HEALTH_RECORD.parse> {
  return HEALTH_RECORD.parse({
    recordId: `steps-${String(count)}`,
    type: 'Steps',
    startTime: '2026-10-08T06:00:00Z',
    endTime: '2026-10-08T07:00:00Z',
    zoneOffsetSeconds: 0,
    sourceApp: 'fit',
    lastModified: '2026-10-08T07:00:00Z',
    data: { count },
  });
}

function ingest(profileId: string, count: number): void {
  opened.store.health.ingest(
    {
      records: [steps(count)],
      deletions: [],
      grantedTypes: ['Steps'],
      source: { device: 'Pixel', appVersion: '1.0' },
    },
    profileId,
  );
}

function clientCaller(client: ClientRow): Caller {
  return { kind: 'client', client };
}

async function peopleOf(caller: Caller): Promise<readonly unknown[]> {
  const summary = await healthSummary(opened.store, caller, { ...RANGE, metrics: ['steps'] });
  const people: unknown = summary['people'];
  return Array.isArray(people) ? Array.from<unknown>(people) : [];
}

beforeEach(async () => {
  captureLogs();
  opened = await testStore();
  const { store } = opened;
  ownerProfile = store.profiles.first();
  memberProfile = store.profiles.create({ name: 'Robin' });
  owner = store.clients.create({
    name: 'Owner phone',
    platform: 'android',
    role: 'owner',
    tokenHash: 'a'.repeat(64),
  });
  const paired = store.clients.create({
    name: 'Member phone',
    platform: 'android',
    role: 'member',
    tokenHash: 'b'.repeat(64),
  });
  member = store.clients.useProfile(paired.id, memberProfile.id);
  ingest(ownerProfile.id, 8000);
  ingest(memberProfile.id, 3000);
});

afterEach(async () => {
  await opened.close();
});

describe('get_health_summary', () => {
  it('gives an owner every person', async () => {
    expect(await peopleOf(clientCaller(owner))).toStrictEqual([
      {
        person: ownerProfile.name,
        days: [{ day: '2026-10-08', metric: 'steps', value: 8000, unit: 'count' }],
      },
      {
        person: memberProfile.name,
        days: [{ day: '2026-10-08', metric: 'steps', value: 3000, unit: 'count' }],
      },
    ]);
  });

  it('gives a member only their own profile', async () => {
    expect(await peopleOf(clientCaller(member))).toStrictEqual([
      {
        person: memberProfile.name,
        days: [{ day: '2026-10-08', metric: 'steps', value: 3000, unit: 'count' }],
      },
    ]);
  });
});

describe('list_homes', () => {
  async function roleFor(caller: Caller): Promise<unknown> {
    return HOMES.parse(await homesOf(opened.store, caller)).homes[0]?.role;
  }

  it('reports the role of whoever asks', async () => {
    expect(await roleFor(clientCaller(owner))).toBe('owner');
    expect(await roleFor(clientCaller(member))).toBe('member');
  });
});
