import type { HealthRecordType } from '@smarteverything/domain';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ScaleReadings } from '../../src/local/scale-readings';
import type { ScaleMeasurement } from '../../src/store/repositories/body-readings';
import { captureLogs, testLogger } from '../support/logs';
import { testStore, type TestStore } from '../support/store';

const NOW = new Date('2026-10-08T10:00:00.000Z');
const DAY = 86_400_000;

let test: TestStore;
let scale: ScaleReadings;
let scaleId: string;

function measurement(overrides: Partial<ScaleMeasurement> = {}): ScaleMeasurement {
  return {
    deviceId: scaleId,
    measuredAt: '2026-10-08T07:30:00.000Z',
    scaleUser: 1,
    weightKg: 70,
    heartRate: null,
    impedance: null,
    ...overrides,
  };
}

function daysAgo(days: number): string {
  return new Date(NOW.getTime() - days * DAY).toISOString();
}

function recordsOf(profileId: string, type: HealthRecordType): number {
  return test.store.health.records(
    { types: [type], from: '2026-01-01T00:00:00.000Z', to: '2027-01-01T00:00:00.000Z' },
    profileId,
  ).length;
}

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
  if (device === undefined) {
    throw new Error('the scale was not stored');
  }
  return device.id;
}

beforeEach(async () => {
  captureLogs();
  test = await testStore(() => NOW);
  scaleId = addScale();
  scale = new ScaleReadings({ store: test.store, log: testLogger('scale') });
});

afterEach(async () => {
  await test.close();
});

describe('attributing a new weighing', () => {
  it('gives it to the only person in the home and saves the weight for them', async () => {
    const owner = test.store.profiles.first();
    const reading = await scale.record(measurement());
    expect(reading).toMatchObject({ profile_id: owner.id, attribution: 'only_profile' });
    expect(recordsOf(owner.id, 'Weight')).toBe(1);
  });

  it('gives it to the person who owns the scale slot', async () => {
    const first = test.store.profiles.first();
    const second = test.store.profiles.create({ name: 'Sam', scale_user: 2 });
    test.store.profiles.update(first.id, { scale_user: 1 });
    expect(await scale.record(measurement({ scaleUser: 2 }))).toMatchObject({
      profile_id: second.id,
      attribution: 'scale',
    });
  });

  it('moves a scale slot to the person it is linked to and frees it from the previous holder', async () => {
    const first = test.store.profiles.first();
    const second = test.store.profiles.create({ name: 'Sam', scale_user: 2 });
    test.store.profiles.update(first.id, { scale_user: 2 });
    expect(test.store.profiles.byId(first.id).scale_user).toBe(2);
    expect(test.store.profiles.byId(second.id).scale_user).toBeNull();
    expect(await scale.record(measurement({ scaleUser: 2 }))).toMatchObject({
      profile_id: first.id,
      attribution: 'scale',
    });
  });

  it('keeps a family weigh-in away from the only profile when it uses another scale slot', async () => {
    const owner = test.store.profiles.first();
    test.store.profiles.update(owner.id, { scale_user: 1 });
    expect(await scale.record(measurement({ scaleUser: 2, weightKg: 70 }))).toMatchObject({
      profile_id: null,
      attribution: 'pending',
    });
    expect(await scale.record(measurement({ scaleUser: 1, measuredAt: daysAgo(1) }))).toMatchObject(
      {
        profile_id: owner.id,
        attribution: 'only_profile',
      },
    );
  });

  it('leaves a weigh-in pending when its slot belongs to nobody and its weight matches nobody', async () => {
    const alice = test.store.profiles.first();
    const sam = test.store.profiles.create({ name: 'Sam' });
    test.store.profiles.update(alice.id, { scale_user: 1 });
    test.store.profiles.update(sam.id, { scale_user: 2 });
    await scale.assign(
      (await scale.record(measurement({ measuredAt: daysAgo(3), weightKg: 60 }))).id,
      alice.id,
    );
    expect(await scale.record(measurement({ scaleUser: 3, weightKg: 75 }))).toMatchObject({
      profile_id: null,
      attribution: 'pending',
    });
  });

  it('picks the one person whose recent weight it matches', async () => {
    const alice = test.store.profiles.first();
    const sam = test.store.profiles.create({ name: 'Sam' });
    await scale.assign(
      (await scale.record(measurement({ measuredAt: daysAgo(3), weightKg: 60 }))).id,
      alice.id,
    );
    await scale.assign(
      (await scale.record(measurement({ scaleUser: 2, measuredAt: daysAgo(2), weightKg: 90 }))).id,
      sam.id,
    );
    expect(await scale.record(measurement({ scaleUser: 5, weightKg: 61 }))).toMatchObject({
      profile_id: alice.id,
      attribution: 'weight',
    });
    expect(recordsOf(alice.id, 'Weight')).toBe(2);
    expect(test.store.profiles.byId(alice.id).scale_user).toBe(1);
  });

  it('counts the weigh-ins of the only person when the scale reports them on two slots', async () => {
    const owner = test.store.profiles.first();
    for (const [index, weightKg] of [88.8, 88.9, 89.2].entries()) {
      await scale.record(measurement({ scaleUser: 0, measuredAt: daysAgo(10 - index), weightKg }));
    }
    expect(test.store.profiles.byId(owner.id).scale_user).toBe(0);
    const reading = await scale.record(
      measurement({ scaleUser: 1, measuredAt: daysAgo(1), weightKg: 90.1 }),
    );
    expect(reading).toMatchObject({ profile_id: owner.id, attribution: 'weight' });
    const pending = test.store.bodyReadings
      .recent(10)
      .filter((row) => row.attribution === 'pending');
    expect(pending).toEqual([]);
    expect(recordsOf(owner.id, 'Weight')).toBe(4);
  });

  it('learns the slot of a person who had none from their first automatic weigh-in', async () => {
    const owner = test.store.profiles.first();
    expect(owner.scale_user).toBeNull();
    await scale.record(measurement({ scaleUser: 4 }));
    expect(test.store.profiles.byId(owner.id).scale_user).toBe(4);
    const sam = test.store.profiles.create({ name: 'Sam' });
    expect(
      await scale.record(measurement({ scaleUser: 4, measuredAt: daysAgo(1), weightKg: 70.4 })),
    ).toMatchObject({ profile_id: owner.id, attribution: 'scale' });
    expect(test.store.profiles.byId(sam.id).scale_user).toBeNull();
  });
});

describe('a weighing that is far from the person', () => {
  const LIVE_SERIES = [88.8, 88.9, 89.2, 87.8, 89.4];

  async function weighed(weights: readonly number[], offset = 0): Promise<void> {
    for (const [index, weightKg] of weights.entries()) {
      await scale.record(measurement({ measuredAt: daysAgo(20 - offset - index), weightKg }));
    }
  }

  it('waits for the person to say who it was instead of counting 204.7 kg', async () => {
    const owner = test.store.profiles.first();
    await weighed(LIVE_SERIES);
    const reading = await scale.record(measurement({ measuredAt: daysAgo(5), weightKg: 204.7 }));
    expect(reading).toMatchObject({ profile_id: null, attribution: 'pending' });
    expect(recordsOf(owner.id, 'Weight')).toBe(LIVE_SERIES.length);
  });

  it('holds back 10.1 kg the same way and counts the next normal weighing again', async () => {
    const owner = test.store.profiles.first();
    await weighed(LIVE_SERIES);
    expect(
      await scale.record(measurement({ measuredAt: daysAgo(5), weightKg: 10.1 })),
    ).toMatchObject({
      attribution: 'pending',
    });
    expect(
      await scale.record(measurement({ measuredAt: daysAgo(4), weightKg: 87.9 })),
    ).toMatchObject({
      profile_id: owner.id,
      attribution: 'only_profile',
    });
  });

  it('counts it once the person says it was them', async () => {
    const owner = test.store.profiles.first();
    await weighed(LIVE_SERIES);
    const held = await scale.record(measurement({ measuredAt: daysAgo(5), weightKg: 100 }));
    expect(held.attribution).toBe('pending');
    expect(await scale.assign(held.id, owner.id)).toMatchObject({
      profile_id: owner.id,
      attribution: 'person',
    });
    expect(recordsOf(owner.id, 'Weight')).toBe(LIVE_SERIES.length + 1);
  });

  it('does not judge a person against the weighings of someone else', async () => {
    const alice = test.store.profiles.first();
    const sam = test.store.profiles.create({ name: 'Sam', scale_user: 2 });
    test.store.profiles.update(alice.id, { scale_user: 1 });
    await weighed(LIVE_SERIES);
    expect(
      await scale.record(measurement({ scaleUser: 2, weightKg: 45, measuredAt: daysAgo(5) })),
    ).toMatchObject({
      profile_id: sam.id,
      attribution: 'scale',
    });
  });
});

describe('merging the parts of one weighing', () => {
  it('keeps one reading when the same moment arrives again with nothing new', async () => {
    const first = await scale.record(measurement());
    const again = await scale.record(measurement());
    expect(again.id).toBe(first.id);
    expect(again.version).toBe(first.version);
    expect(test.store.bodyReadings.recent(10)).toHaveLength(1);
  });

  it('adds the impedance that arrives later and computes the body composition', async () => {
    const profile = test.store.profiles.first();
    test.store.profiles.update(profile.id, {
      sex: 'female',
      birth_date: '1990-05-01',
      height_cm: 170,
    });
    const weighed = await scale.record(measurement({ weightKg: 65 }));
    expect(weighed.composition).toBeNull();
    expect(weighed.bmi).toBeCloseTo(22.5, 1);
    await scale.record(measurement({ weightKg: null, impedance: 500 }));
    const done = await scale.record(measurement({ weightKg: null, impedance: 480 }));
    expect(done.id).toBe(weighed.id);
    expect(done.impedance_low).toBe(500);
    expect(done.impedance_high).toBe(480);
    expect(done.composition?.body_fat_percent).toBeGreaterThan(0);
    expect(recordsOf(profile.id, 'BodyFat')).toBe(1);
  });

  it('computes nothing until the person has sex, birth date and height', async () => {
    const profile = test.store.profiles.first();
    const reading = await scale.record(measurement({ weightKg: 65, impedance: 500 }));
    expect(reading.composition).toBeNull();
    expect(reading.bmi).toBeNull();
    expect(recordsOf(profile.id, 'Weight')).toBe(1);
    expect(recordsOf(profile.id, 'BodyFat')).toBe(0);
  });
});

describe('assigning a reading by hand', () => {
  it('moves the saved records to the chosen person and teaches the scale slot', async () => {
    const alice = test.store.profiles.first();
    const sam = test.store.profiles.create({ name: 'Sam' });
    const reading = await scale.record(measurement({ scaleUser: 3 }));
    expect(reading.attribution).toBe('pending');
    const moved = await scale.assign(reading.id, sam.id);
    expect(moved).toMatchObject({ profile_id: sam.id, attribution: 'person' });
    expect(test.store.profiles.byId(sam.id).scale_user).toBe(3);
    expect(recordsOf(sam.id, 'Weight')).toBe(1);
    const back = await scale.assign(reading.id, alice.id);
    expect(back.profile_id).toBe(alice.id);
    expect(test.store.profiles.byId(alice.id).scale_user).toBe(3);
    expect(test.store.profiles.byId(sam.id).scale_user).toBeNull();
    expect(recordsOf(sam.id, 'Weight')).toBe(0);
    expect(recordsOf(alice.id, 'Weight')).toBe(1);
  });

  it('ignoring a reading takes its records away from everyone', async () => {
    const owner = test.store.profiles.first();
    const reading = await scale.record(measurement());
    expect(recordsOf(owner.id, 'Weight')).toBe(1);
    expect(await scale.assign(reading.id, null)).toMatchObject({
      profile_id: null,
      attribution: 'ignored',
    });
    expect(recordsOf(owner.id, 'Weight')).toBe(0);
  });

  it('refuses a person who does not exist', async () => {
    const reading = await scale.record(measurement());
    await expect(scale.assign(reading.id, crypto.randomUUID())).rejects.toThrow();
  });
});

describe('recomputing', () => {
  it('fills in the composition once the person gains the facts it needs', async () => {
    const profile = test.store.profiles.first();
    const reading = await scale.record(measurement({ weightKg: 65, impedance: 500 }));
    expect(reading.composition).toBeNull();
    expect(await scale.recomputeOutdated()).toBe(0);
    test.store.profiles.update(profile.id, {
      sex: 'male',
      birth_date: '1985-02-03',
      height_cm: 180,
    });
    expect(await scale.recomputeOutdated()).toBe(1);
    const after = test.store.bodyReadings.byId(reading.id);
    expect(after.composition).not.toBeNull();
    expect(after.bmi).toBeCloseTo(20.1, 1);
    expect(recordsOf(profile.id, 'BodyFat')).toBe(1);
    expect(await scale.recomputeOutdated()).toBe(0);
  });

  it('recomputes every attributed reading of one person', async () => {
    const profile = test.store.profiles.first();
    await scale.record(measurement({ measuredAt: daysAgo(2), weightKg: 65 }));
    await scale.record(measurement({ measuredAt: daysAgo(1), weightKg: 66 }));
    expect(await scale.recomputeFor(profile.id)).toBe(2);
  });
});
