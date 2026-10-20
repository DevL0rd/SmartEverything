import { describe, expect, it } from 'vitest';
import { recordsOfType } from './records';
import { nightOf, type SleepNight } from './sleep';
import { NIGHT_VITAL_TYPES, vitalsOf } from './night-vitals';
import { at, seedRecord } from './test-support';

const NIGHT: SleepNight = nightOf(
  recordsOfType(
    [
      seedRecord({
        type: 'SleepSession',
        start: at(7, 23),
        end: at(8, 7),
        data: { title: null, notes: null, stages: [] },
      }),
    ],
    'SleepSession',
  )[0]!,
);

function heart(samples: readonly (readonly [Date, number])[]): ReturnType<typeof seedRecord> {
  return seedRecord({
    type: 'HeartRate',
    start: samples[0]![0],
    end: samples[samples.length - 1]![0],
    data: { samples: samples.map(([time, bpm]) => ({ time: time.toISOString(), bpm })) },
  });
}

function oxygen(time: Date, percent: number): ReturnType<typeof seedRecord> {
  return seedRecord({ type: 'OxygenSaturation', start: time, data: { percent } });
}

describe('night vitals', () => {
  it('asks for the four night measures', () => {
    expect(NIGHT_VITAL_TYPES).toEqual([
      'HeartRate',
      'OxygenSaturation',
      'SkinTemperature',
      'RespiratoryRate',
    ]);
  });

  it('returns nothing when no measure has data in the night', () => {
    expect(vitalsOf([], NIGHT)).toEqual([]);
    expect(vitalsOf([heart([[at(8, 9), 60]])], NIGHT)).toEqual([]);
  });

  it('summarises heart rate with its average and lowest point inside the night', () => {
    const [vital] = vitalsOf(
      [
        heart([
          [at(7, 22, 50), 90],
          [at(8, 1), 60],
          [at(8, 2, 40), 48],
          [at(8, 7, 10), 80],
        ]),
      ],
      NIGHT,
    );
    expect(vital?.key).toBe('heart');
    expect(vital?.points.map((point) => point.value)).toEqual([60, 48]);
    expect(vital?.summary).toBe('average 54\u00a0bpm');
    expect(vital?.note).toContain('Lowest 48\u00a0bpm');
    expect(vital?.note).toContain('2:40');
    expect(vital?.lowMark).toBe(true);
  });

  it('marks blood oxygen dips under 90 and widens the domain to the lowest value', () => {
    const [vital] = vitalsOf(
      [oxygen(at(8, 1), 97), oxygen(at(8, 3, 24), 87), oxygen(at(8, 4), 95)],
      NIGHT,
    );
    expect(vital?.key).toBe('oxygen');
    expect(vital?.ringBelow).toBe(90);
    expect(vital?.guide).toBe(90);
    expect(vital?.domain).toEqual([85, 100]);
    expect(vital?.summary).toBe('average 93% · lowest 87%');
    expect(vital?.note).toBe('Under 90% at 3:24 AM');
  });

  it('extends the oxygen domain below 85 and has no note without a dip', () => {
    const [low] = vitalsOf([oxygen(at(8, 1), 80)], NIGHT);
    expect(low?.domain).toEqual([80, 100]);
    const [fine] = vitalsOf([oxygen(at(8, 1), 96)], NIGHT);
    expect(fine?.note).toBeNull();
  });

  it('orders the measures and reports skin temperature as a change around zero', () => {
    const vitals = vitalsOf(
      [
        seedRecord({
          type: 'RespiratoryRate',
          start: at(8, 2),
          data: { rate: 14 },
        }),
        seedRecord({
          type: 'SkinTemperature',
          start: at(7, 23),
          end: at(8, 7),
          data: {
            baselineCelsius: 33,
            measurementLocation: 0,
            deltas: [
              { time: at(8, 1).toISOString(), celsius: 0.2 },
              { time: at(8, 3).toISOString(), celsius: 0.6 },
            ],
          },
        }),
        oxygen(at(8, 1), 96),
      ],
      NIGHT,
    );
    expect(vitals.map((vital) => vital.key)).toEqual(['oxygen', 'skin', 'breathing']);
    const skin = vitals[1];
    expect(skin?.summary).toBe('+0.4 °C vs usual');
    expect(skin?.guide).toBe(0);
    expect(skin?.domain).toEqual([-1, 1]);
    expect(vitals[2]?.summary).toBe('14 per minute');
  });
});
