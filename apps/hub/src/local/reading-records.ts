import {
  HEALTH_RECORD,
  type BodyComposition,
  type BodyReadingRow,
  type HealthRecord,
  type OutboxReading,
  zoneOffsetSeconds,
} from '@smarteverything/domain';

const SCALE_SOURCE_APP = 'smarteverything.scale';

const RECORD_TYPES = [
  'Weight',
  'BodyFat',
  'BasalMetabolicRate',
  'LeanBodyMass',
  'BoneMass',
  'BodyWaterMass',
  'HeartRate',
  'Height',
] as const;

export function recordIdsOf(readingId: string): string[] {
  return RECORD_TYPES.map((type) => `scale:${readingId}:${type}`);
}

function dataOf(
  reading: BodyReadingRow,
  heightCm: number | null,
): Partial<Record<(typeof RECORD_TYPES)[number], unknown>> {
  const composition = reading.composition;
  const at = reading.measured_at;
  return {
    Weight: reading.weight_kg === null ? undefined : { kilograms: reading.weight_kg },
    BodyFat: composition === null ? undefined : { percent: composition.body_fat_percent },
    BasalMetabolicRate:
      composition === null ? undefined : { kilocaloriesPerDay: composition.bmr_kcal },
    LeanBodyMass: composition === null ? undefined : { kilograms: composition.lean_mass_kg },
    BoneMass: composition === null ? undefined : { kilograms: composition.bone_mass_kg },
    BodyWaterMass: composition === null ? undefined : { kilograms: composition.water_mass_kg },
    HeartRate:
      reading.heart_rate === null
        ? undefined
        : { samples: [{ time: at, bpm: reading.heart_rate }] },
    Height: heightCm === null ? undefined : { meters: heightCm / 100 },
  };
}

export interface RecordContext {
  readonly timeZone: string;
  readonly heightCm: number | null;
}

export function healthRecordsOf(reading: BodyReadingRow, context: RecordContext): HealthRecord[] {
  const offset = zoneOffsetSeconds(context.timeZone, new Date(reading.measured_at));
  const data = dataOf(reading, context.heightCm);
  return RECORD_TYPES.flatMap((type) => {
    const value = data[type];
    if (value === undefined) {
      return [];
    }
    return [
      HEALTH_RECORD.parse({
        recordId: `scale:${reading.id}:${type}`,
        type,
        startTime: reading.measured_at,
        endTime: type === 'HeartRate' ? reading.measured_at : null,
        zoneOffsetSeconds: offset,
        sourceApp: SCALE_SOURCE_APP,
        lastModified: reading.updated_at,
        data: value,
      }),
    ];
  });
}

function compositionOf(
  composition: BodyComposition | null,
): Pick<
  OutboxReading,
  'bodyFatPercent' | 'basalMetabolicRateKcal' | 'leanMassKg' | 'boneMassKg' | 'waterMassKg'
> {
  return composition === null
    ? {
        bodyFatPercent: null,
        basalMetabolicRateKcal: null,
        leanMassKg: null,
        boneMassKg: null,
        waterMassKg: null,
      }
    : {
        bodyFatPercent: composition.body_fat_percent,
        basalMetabolicRateKcal: composition.bmr_kcal,
        leanMassKg: composition.lean_mass_kg,
        boneMassKg: composition.bone_mass_kg,
        waterMassKg: composition.water_mass_kg,
      };
}

export function outboxReadingOf(
  reading: BodyReadingRow,
  heightCm: number | null,
): OutboxReading | null {
  if (reading.weight_kg === null) {
    return null;
  }
  return {
    id: reading.id,
    version: reading.version,
    measuredAt: reading.measured_at,
    weightKg: reading.weight_kg,
    heartRate: reading.heart_rate,
    heightMeters: heightCm === null ? null : heightCm / 100,
    ...compositionOf(reading.composition),
  };
}
