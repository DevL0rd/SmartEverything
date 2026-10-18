import type { BodyReadingRow, LiveChange, ProfileRow } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScaleReadings } from '../../src/local/scale-readings';
import { projected, visible, type Hearing } from '../../src/server/live-visibility';
import { bodyTables } from '../../src/server/person-privacy';
import { captureLogs, testLogger } from '../support/logs';
import { addPerson, type TestPerson } from '../support/phone-fixtures';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-10-18T09:00:00.000Z');

let test: TestStore;
let dana: TestPerson;
let sam: TestPerson;
let owner: TestPerson;
let scaleId: string;
let scale: ScaleReadings;

function addScale(): string {
  const [device] = test.store.devices.upsert([
    {
      provider: 'xiaomi',
      externalId: 'xiaomi_scale:D0:7B:6F:A6:AB:45',
      parentId: null,
      kind: 'sensor',
      name: 'Scale',
      model: 'yunmai.scales',
      manufacturer: 'Xiaomi',
      providerRoom: null,
      roomId: null,
      online: true,
      capabilities: [],
      details: {},
    },
  ]);
  if (device === undefined) throw new Error('the scale was not stored');
  return device.id;
}

function weigh(scaleUser: number, at: string, weightKg: number): BodyReadingRow {
  return scale.record({
    deviceId: scaleId,
    measuredAt: at,
    scaleUser,
    weightKg,
    heartRate: null,
    impedance: null,
  });
}

beforeEach(async () => {
  captureLogs();
  test = await testStore(() => NOW);
  scaleId = addScale();
  scale = new ScaleReadings({ store: test.store, log: testLogger('scale') });
  dana = addPerson(test, 'Dana', 'member');
  sam = addPerson(test, 'Sam', 'member');
  owner = addPerson(test, 'Owner', 'owner');
  test.store.profiles.update(dana.profileId, {
    sex: 'female',
    birth_date: '1990-05-05',
    height_cm: 170,
    scale_user: 1,
  });
  test.store.profiles.update(sam.profileId, {
    sex: 'male',
    birth_date: '1985-01-02',
    height_cm: 182,
    scale_user: 2,
  });
});

afterEach(async () => {
  await test.close();
});

function profileOf(tables: ReturnType<typeof bodyTables>, id: string): ProfileRow {
  const found = tables.profiles.find((profile) => profile.id === id);
  if (found === undefined) throw new Error(`profile ${id} is listed`);
  return found;
}

describe('the body data in a snapshot', () => {
  it('shows a member their own body facts and only the name, colour and slot of everyone else', () => {
    const tables = bodyTables(test.store, { role: 'member', profileId: sam.profileId });
    expect(profileOf(tables, sam.profileId)).toMatchObject({
      sex: 'male',
      birth_date: '1985-01-02',
      height_cm: 182,
    });
    expect(profileOf(tables, dana.profileId)).toMatchObject({
      name: 'Dana',
      scale_user: 1,
      sex: null,
      birth_date: null,
      height_cm: null,
      max_heart_rate: null,
      fitness_goals: {
        steps: null,
        move_kcal: null,
        active_minutes: null,
        sleep_minutes: null,
        hydration_ml: null,
      },
    });
  });

  it('shows an owner every body fact', () => {
    const tables = bodyTables(test.store, { role: 'owner', profileId: owner.profileId });
    expect(profileOf(tables, dana.profileId)).toMatchObject({
      sex: 'female',
      birth_date: '1990-05-05',
      height_cm: 170,
    });
  });

  it('shows a member their own weigh-ins and the ones nobody claimed, never someone else’s', () => {
    const danas = weigh(1, '2026-10-18T07:00:00.000Z', 61);
    const sams = weigh(2, '2026-10-18T07:05:00.000Z', 80);
    const unclaimed = weigh(7, '2026-10-18T07:10:00.000Z', 90);
    expect(unclaimed.profile_id).toBeNull();
    const seen = bodyTables(test.store, { role: 'member', profileId: sam.profileId }).body_readings;
    expect(seen.map((reading) => reading.id).sort()).toStrictEqual([sams.id, unclaimed.id].sort());
    expect(seen.map((reading) => reading.id)).not.toContain(danas.id);
    const all = bodyTables(test.store, { role: 'owner', profileId: owner.profileId });
    expect(all.body_readings).toHaveLength(3);
  });
});

function hearing(person: TestPerson): Hearing {
  return {
    client: person.client,
    tables: new Set(['profiles', 'body_readings']),
  };
}

function readingChange(
  record: BodyReadingRow | null,
  oldRecord: BodyReadingRow | null,
): LiveChange {
  return {
    type: 'change',
    table: 'body_readings',
    operation: 'UPDATE',
    record,
    oldRecord,
    seq: 1,
  };
}

describe('the body data in live changes', () => {
  it('does not send a member another person’s weigh-in', () => {
    const danas = weigh(1, '2026-10-18T07:00:00.000Z', 61);
    const change = readingChange(danas, null);
    expect(visible(hearing(sam), change, test.store)).toBe(false);
    expect(projected(hearing(sam), change, test.store)).toBeNull();
    expect(projected(hearing(dana), change, test.store)).toStrictEqual(change);
    expect(projected(hearing(owner), change, test.store)).toStrictEqual(change);
  });

  it('removes a pending weigh-in from a member who sees it claimed by someone else', () => {
    const pending = weigh(7, '2026-10-18T07:10:00.000Z', 90);
    const claimed: BodyReadingRow = { ...pending, profile_id: dana.profileId };
    const shown = projected(hearing(sam), readingChange(claimed, pending), test.store);
    expect(shown).toMatchObject({ table: 'body_readings', record: null, oldRecord: pending });
  });

  it('sends a member the other people’s profile changes without their body facts', () => {
    const danaRow = test.store.profiles.byId(dana.profileId);
    const change: LiveChange = {
      type: 'change',
      table: 'profiles',
      operation: 'UPDATE',
      record: danaRow,
      oldRecord: danaRow,
      seq: 2,
    };
    const shown = projected(hearing(sam), change, test.store);
    expect(shown).toMatchObject({
      record: { name: 'Dana', sex: null, birth_date: null, height_cm: null },
      oldRecord: { sex: null },
    });
    expect(projected(hearing(dana), change, test.store)).toMatchObject({
      record: { sex: 'female', height_cm: 170 },
    });
    expect(projected(hearing(owner), change, test.store)).toMatchObject({
      record: { sex: 'female' },
    });
  });
});
