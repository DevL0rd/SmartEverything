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
  it('gives it to the only person in the home and saves the weight for them', () => {
    const owner = test.store.profiles.first();
    const reading = scale.record(measurement());
    expect(reading).toMatchObject({ profile_id: owner.id, attribution: 'only_profile' });
    expect(recordsOf(owner.id, 'Weight')).toBe(1);
  });

  it('gives it to the person who owns the scale slot', () => {
    const first = test.store.profiles.first();
    const second = test.store.profiles.create({ name: 'Sam', scale_user: 2 });
    test.store.profiles.update(first.id, { scale_user: 1 });
    expect(scale.record(measurement({ scaleUser: 2 }))).toMatchObject({
      profile_id: second.id,
      attribution: 'scale',
    });
  });

  it('moves a scale slot to the person it is linked to and frees it from the previous holder', () => {
    const first = test.store.profiles.first();
    const second = test.store.profiles.create({ name: 'Sam', scale_user: 2 });
    test.store.profiles.update(first.id, { scale_user: 2 });
    expect(test.store.profiles.byId(first.id).scale_user).toBe(2);
    expect(test.store.profiles.byId(second.id).scale_user).toBeNull();
    expect(scale.record(measurement({ scaleUser: 2 }))).toMatchObject({
      profile_id: first.id,
      attribution: 'scale',
    });
  });

  it('keeps a family weigh-in away from the only profile when it uses another scale slot', () => {
    const owner = test.store.profiles.first();
    test.store.profiles.update(owner.id, { scale_user: 1 });
    expect(scale.record(measurement({ scaleUser: 2, weightKg: 70 }))).toMatchObject({
      profile_id: null,
      attribution: 'pending',
    });
    expect(scale.record(measurement({ scaleUser: 1, measuredAt: daysAgo(1) }))).toMatchObject({
      profile_id: owner.id,
      attribution: 'only_profile',
    });
  });

  it('leaves a weigh-in pending when its scale slot belongs to nobody and the home has several people', () => {
    const alice = test.store.profiles.first();
    const sam = test.store.profiles.create({ name: 'Sam' });
    test.store.profiles.update(alice.id, { scale_user: 1 });
    test.store.profiles.update(sam.id, { scale_user: 2 });
    scale.assign(scale.record(measurement({ measuredAt: daysAgo(3), weightKg: 60 })).id, alice.id);
    expect(scale.record(measurement({ scaleUser: 3, weightKg: 60.5 }))).toMatchObject({
      profile_id: null,
      attribution: 'pending',
    });
  });

  it('never picks a person by how close the weight is', () => {
    const alice = test.store.profiles.first();
    const sam = test.store.profiles.create({ name: 'Sam' });
    scale.assign(scale.record(measurement({ measuredAt: daysAgo(3), weightKg: 60 })).id, alice.id);
    scale.assign(scale.record(measurement({ measuredAt: daysAgo(2), weightKg: 90 })).id, sam.id);
    expect(scale.record(measurement({ scaleUser: 5, weightKg: 61 }))).toMatchObject({
      profile_id: null,
      attribution: 'pending',
    });
  });
});

describe('a weighing that is far from the person', () => {
  const LIVE_SERIES = [88.8, 88.9, 89.2, 87.8, 89.4];

  function weighed(weights: readonly number[], offset = 0): void {
    weights.forEach((weightKg, index) => {
      scale.record(measurement({ measuredAt: daysAgo(20 - offset - index), weightKg }));
    });
  }

  it('waits for the person to say who it was instead of counting 204.7 kg', () => {
    const owner = test.store.profiles.first();
    weighed(LIVE_SERIES);
    const reading = scale.record(measurement({ measuredAt: daysAgo(5), weightKg: 204.7 }));
    expect(reading).toMatchObject({ profile_id: null, attribution: 'pending' });
    expect(recordsOf(owner.id, 'Weight')).toBe(LIVE_SERIES.length);
  });

  it('holds back 10.1 kg the same way and counts the next normal weighing again', () => {
    const owner = test.store.profiles.first();
    weighed(LIVE_SERIES);
    expect(scale.record(measurement({ measuredAt: daysAgo(5), weightKg: 10.1 }))).toMatchObject({
      attribution: 'pending',
    });
    expect(scale.record(measurement({ measuredAt: daysAgo(4), weightKg: 87.9 }))).toMatchObject({
      profile_id: owner.id,
      attribution: 'only_profile',
    });
  });

  it('counts it once the person says it was them', () => {
    const owner = test.store.profiles.first();
    weighed(LIVE_SERIES);
    const held = scale.record(measurement({ measuredAt: daysAgo(5), weightKg: 100 }));
    expect(held.attribution).toBe('pending');
    expect(scale.assign(held.id, owner.id)).toMatchObject({
      profile_id: owner.id,
      attribution: 'person',
    });
    expect(recordsOf(owner.id, 'Weight')).toBe(LIVE_SERIES.length + 1);
  });

  it('does not judge a person against the weighings of someone else', () => {
    const alice = test.store.profiles.first();
    const sam = test.store.profiles.create({ name: 'Sam', scale_user: 2 });
    test.store.profiles.update(alice.id, { scale_user: 1 });
    weighed(LIVE_SERIES);
    expect(
      scale.record(measurement({ scaleUser: 2, weightKg: 45, measuredAt: daysAgo(5) })),
    ).toMatchObject({
      profile_id: sam.id,
      attribution: 'scale',
    });
  });
});

describe('merging the parts of one weighing', () => {
  it('keeps one reading when the same moment arrives again with nothing new', () => {
    const first = scale.record(measurement());
    const again = scale.record(measurement());
    expect(again.id).toBe(first.id);
    expect(again.version).toBe(first.version);
    expect(test.store.bodyReadings.recent(10)).toHaveLength(1);
  });

  it('adds the impedance that arrives later and computes the body composition', () => {
    const profile = test.store.profiles.first();
    test.store.profiles.update(profile.id, {
      sex: 'female',
      birth_date: '1990-05-01',
      height_cm: 170,
    });
    const weighed = scale.record(measurement({ weightKg: 65 }));
    expect(weighed.composition).toBeNull();
    expect(weighed.bmi).toBeCloseTo(22.5, 1);
    scale.record(measurement({ weightKg: null, impedance: 500 }));
    const done = scale.record(measurement({ weightKg: null, impedance: 480 }));
    expect(done.id).toBe(weighed.id);
    expect(done.impedance_low).toBe(500);
    expect(done.impedance_high).toBe(480);
    expect(done.composition?.body_fat_percent).toBeGreaterThan(0);
    expect(recordsOf(profile.id, 'BodyFat')).toBe(1);
  });

  it('computes nothing until the person has sex, birth date and height', () => {
    const profile = test.store.profiles.first();
    const reading = scale.record(measurement({ weightKg: 65, impedance: 500 }));
    expect(reading.composition).toBeNull();
    expect(reading.bmi).toBeNull();
    expect(recordsOf(profile.id, 'Weight')).toBe(1);
    expect(recordsOf(profile.id, 'BodyFat')).toBe(0);
  });
});

describe('assigning a reading by hand', () => {
  it('moves the saved records to the chosen person and teaches the scale slot', () => {
    const alice = test.store.profiles.first();
    const sam = test.store.profiles.create({ name: 'Sam' });
    const reading = scale.record(measurement({ scaleUser: 3 }));
    expect(reading.attribution).toBe('pending');
    const moved = scale.assign(reading.id, sam.id);
    expect(moved).toMatchObject({ profile_id: sam.id, attribution: 'person' });
    expect(test.store.profiles.byId(sam.id).scale_user).toBe(3);
    expect(recordsOf(sam.id, 'Weight')).toBe(1);
    const back = scale.assign(reading.id, alice.id);
    expect(back.profile_id).toBe(alice.id);
    expect(recordsOf(sam.id, 'Weight')).toBe(0);
    expect(recordsOf(alice.id, 'Weight')).toBe(1);
  });

  it('ignoring a reading takes its records away from everyone', () => {
    const owner = test.store.profiles.first();
    const reading = scale.record(measurement());
    expect(recordsOf(owner.id, 'Weight')).toBe(1);
    expect(scale.assign(reading.id, null)).toMatchObject({
      profile_id: null,
      attribution: 'ignored',
    });
    expect(recordsOf(owner.id, 'Weight')).toBe(0);
  });

  it('refuses a person who does not exist', () => {
    const reading = scale.record(measurement());
    expect(() => scale.assign(reading.id, crypto.randomUUID())).toThrow();
  });
});

describe('recomputing', () => {
  it('fills in the composition once the person gains the facts it needs', () => {
    const profile = test.store.profiles.first();
    const reading = scale.record(measurement({ weightKg: 65, impedance: 500 }));
    expect(reading.composition).toBeNull();
    expect(scale.recomputeOutdated()).toBe(0);
    test.store.profiles.update(profile.id, {
      sex: 'male',
      birth_date: '1985-02-03',
      height_cm: 180,
    });
    expect(scale.recomputeOutdated()).toBe(1);
    const after = test.store.bodyReadings.byId(reading.id);
    expect(after.composition).not.toBeNull();
    expect(after.bmi).toBeCloseTo(20.1, 1);
    expect(recordsOf(profile.id, 'BodyFat')).toBe(1);
    expect(scale.recomputeOutdated()).toBe(0);
  });

  it('recomputes every attributed reading of one person', () => {
    const profile = test.store.profiles.first();
    scale.record(measurement({ measuredAt: daysAgo(2), weightKg: 65 }));
    scale.record(measurement({ measuredAt: daysAgo(1), weightKg: 66 }));
    expect(scale.recomputeFor(profile.id)).toBe(2);
  });
});
