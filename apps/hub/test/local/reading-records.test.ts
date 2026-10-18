import { bodyComposition, type BodyReadingRow } from '@smarteverything/domain';
import { describe, expect, it } from 'vitest';
import { healthRecordsOf, outboxReadingOf, recordIdsOf } from '../../src/local/reading-records';

const READING_ID = '0f4c5d1e-7b3a-4c1e-9d2f-1a2b3c4d5e6f';

const COMPOSITION = bodyComposition({
  weightKg: 70,
  impedanceLow: 500,
  impedanceHigh: null,
  sex: 'male',
  age: 30,
  heightCm: 175,
});

function reading(overrides: Partial<BodyReadingRow> = {}): BodyReadingRow {
  return {
    id: READING_ID,
    device_id: '1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed',
    profile_id: '6ec0bd7f-11c0-43da-975e-2a8ad9ebae0b',
    measured_at: '2026-10-08T07:30:00.000Z',
    weight_kg: 70.4,
    impedance_low: 500,
    impedance_high: null,
    heart_rate: 61,
    scale_user: 1,
    attribution: 'scale',
    bmi: 23,
    composition: COMPOSITION,
    version: 3,
    saved_to_health_connect_at: null,
    created_at: '2026-10-08T07:30:01.000Z',
    updated_at: '2026-10-08T07:31:00.000Z',
    ...overrides,
  };
}

const CONTEXT = { timeZone: 'UTC', heightCm: 175 };

describe('recordIdsOf', () => {
  it('names one deterministic record per measurement type of the reading', () => {
    expect(recordIdsOf(READING_ID)).toEqual([
      `scale:${READING_ID}:Weight`,
      `scale:${READING_ID}:BodyFat`,
      `scale:${READING_ID}:BasalMetabolicRate`,
      `scale:${READING_ID}:LeanBodyMass`,
      `scale:${READING_ID}:BoneMass`,
      `scale:${READING_ID}:BodyWaterMass`,
      `scale:${READING_ID}:HeartRate`,
      `scale:${READING_ID}:Height`,
    ]);
  });
});

describe('healthRecordsOf', () => {
  it('writes every record of a full reading under the ids recordIdsOf promises', () => {
    const records = healthRecordsOf(reading(), CONTEXT);
    expect(records.map((record) => record.recordId)).toEqual(recordIdsOf(READING_ID));
  });

  it('carries the scale values in the units Health Connect expects', () => {
    const byType = new Map(
      healthRecordsOf(reading(), CONTEXT).map((record) => [record.type, record.data]),
    );
    expect(byType.get('Weight')).toEqual({ kilograms: 70.4 });
    expect(byType.get('BodyFat')).toEqual({ percent: COMPOSITION.body_fat_percent });
    expect(byType.get('BasalMetabolicRate')).toEqual({ kilocaloriesPerDay: COMPOSITION.bmr_kcal });
    expect(byType.get('LeanBodyMass')).toEqual({ kilograms: COMPOSITION.lean_mass_kg });
    expect(byType.get('BoneMass')).toEqual({ kilograms: COMPOSITION.bone_mass_kg });
    expect(byType.get('BodyWaterMass')).toEqual({ kilograms: COMPOSITION.water_mass_kg });
    expect(byType.get('Height')).toEqual({ meters: 1.75 });
    expect(byType.get('HeartRate')).toEqual({
      samples: [{ time: '2026-10-08T07:30:00.000Z', bpm: 61 }],
    });
  });

  it('stamps the measurement time, the save time and the zone offset of that moment', () => {
    const [weight] = healthRecordsOf(reading(), { timeZone: 'Asia/Bangkok', heightCm: null });
    expect(weight).toMatchObject({
      type: 'Weight',
      startTime: '2026-10-08T07:30:00.000Z',
      endTime: null,
      zoneOffsetSeconds: 7 * 3600,
      lastModified: '2026-10-08T07:31:00.000Z',
      sourceApp: 'smarteverything.scale',
    });
  });

  it('closes only the heart-rate record at the measurement time', () => {
    const ends = new Map(
      healthRecordsOf(reading(), CONTEXT).map((record) => [record.type, record.endTime]),
    );
    expect(ends.get('HeartRate')).toBe('2026-10-08T07:30:00.000Z');
    expect(ends.get('Weight')).toBeNull();
  });

  it('writes only the weight when nothing else is known', () => {
    const records = healthRecordsOf(reading({ composition: null, heart_rate: null }), {
      timeZone: 'UTC',
      heightCm: null,
    });
    expect(records.map((record) => record.type)).toEqual(['Weight']);
  });

  it('writes no weight record for a reading without weight', () => {
    const types = healthRecordsOf(reading({ weight_kg: null }), CONTEXT).map(
      (record) => record.type,
    );
    expect(types).not.toContain('Weight');
    expect(types).toContain('BodyFat');
  });
});

describe('outboxReadingOf', () => {
  it('sends the weight with every value the reading has', () => {
    expect(outboxReadingOf(reading(), 175)).toEqual({
      id: READING_ID,
      version: 3,
      measuredAt: '2026-10-08T07:30:00.000Z',
      weightKg: 70.4,
      heartRate: 61,
      heightMeters: 1.75,
      bodyFatPercent: COMPOSITION.body_fat_percent,
      basalMetabolicRateKcal: COMPOSITION.bmr_kcal,
      leanMassKg: COMPOSITION.lean_mass_kg,
      boneMassKg: COMPOSITION.bone_mass_kg,
      waterMassKg: COMPOSITION.water_mass_kg,
    });
  });

  it('leaves the composition and height empty when they are unknown', () => {
    expect(outboxReadingOf(reading({ composition: null }), null)).toMatchObject({
      heightMeters: null,
      bodyFatPercent: null,
      basalMetabolicRateKcal: null,
      leanMassKg: null,
      boneMassKg: null,
      waterMassKg: null,
    });
  });

  it('sends nothing for a reading without weight', () => {
    expect(outboxReadingOf(reading({ weight_kg: null }), 175)).toBeNull();
  });
});
