import { describe, expect, it } from 'vitest';
import {
  bottleChargesFromBattery,
  bottleChargesFromVoltage,
  bottleDaysLeft,
  bottleFaultName,
  bottleSessionsOf,
  type BottleBatteryPoint,
  type BottleReadingRow,
} from '../src';

function reading(
  minute: number,
  kind: BottleReadingRow['kind'],
  volumeMl: number | null,
  extra: Partial<BottleReadingRow> = {},
): BottleReadingRow {
  return {
    at: new Date(Date.UTC(2026, 9, 18, 8, minute)).toISOString(),
    trigger: 'cap',
    distanceMm: 100,
    kcps: 6000,
    ledOhm: 10000,
    verdict: 'accepted',
    volumeMl,
    kind,
    ml: null,
    drunkMl: null,
    ...extra,
  };
}

describe('bottle sessions from fill to fill', () => {
  const rows = [
    reading(0, 'seed', 500),
    reading(10, 'drink', 420, { ml: 80 }),
    reading(20, 'drink', 330, { ml: 90 }),
    reading(30, 'rejected', 300, { verdict: 'slosh' }),
    reading(60, 'fill', 680, { ml: 350, drunkMl: 5 }),
    reading(70, 'drink', 600, { ml: 80 }),
  ];

  it('starts a new session at each fill and puts the ml drunk before it in the old one', () => {
    const sessions = bottleSessionsOf(rows);
    expect(sessions).toHaveLength(2);
    const [latest, earlier] = sessions;
    expect(earlier).toMatchObject({
      startMl: 500,
      endMl: 330,
      drunkMl: 175,
      drinks: 2,
      open: false,
    });
    expect(latest).toMatchObject({ startMl: 680, endMl: 600, drunkMl: 80, drinks: 1, open: true });
  });

  it('draws the curve from the accepted readings only', () => {
    const [, earlier] = bottleSessionsOf(rows);
    expect(earlier?.curve.map((point) => point.ml)).toStrictEqual([500, 420, 330]);
    expect(earlier?.readings).toBe(3);
  });

  it('has no sessions without readings, and one session for a single reading', () => {
    expect(bottleSessionsOf([])).toStrictEqual([]);
    expect(bottleSessionsOf([reading(0, 'seed', 500)])).toHaveLength(1);
  });

  it('keeps a reading with no volume out of the curve', () => {
    const [only] = bottleSessionsOf([reading(0, 'small', null)]);
    expect(only?.curve).toStrictEqual([]);
    expect(only?.readings).toBe(1);
  });

  it('counts a fill without a drunk amount as nothing drunk', () => {
    const [, earlier] = bottleSessionsOf([reading(0, 'seed', 200), reading(10, 'fill', 600)]);
    expect(earlier?.drunkMl).toBe(0);
    expect(bottleSessionsOf([reading(0, 'seed', 200), reading(5, 'drink', 100)])[0]?.drunkMl).toBe(
      0,
    );
  });
});

function battery(day: number, pct: number): BottleBatteryPoint {
  return { at: new Date(Date.UTC(2026, 9, day, 12)).toISOString(), pct };
}

describe('bottle battery', () => {
  it('sees a charge as a jump of ten points or more between two reads', () => {
    const charges = bottleChargesFromBattery([battery(1, 40), battery(2, 38), battery(3, 100)]);
    expect(charges).toHaveLength(1);
    expect(charges[0]).toMatchObject({ gainedPct: 62, volts: [] });
    expect(bottleChargesFromBattery([battery(1, 40), battery(2, 49)])).toStrictEqual([]);
  });

  it('estimates the days left from the discharge slope and ignores charges', () => {
    const points = [
      battery(1, 80),
      battery(3, 70),
      battery(5, 60),
      battery(6, 100),
      battery(8, 90),
    ];
    expect(bottleDaysLeft(points, 5)).toBe(17);
  });

  it('says nothing without a week of discharge to learn from', () => {
    expect(bottleDaysLeft([], 5)).toBeNull();
    expect(bottleDaysLeft([battery(1, 80)], 5)).toBeNull();
    expect(bottleDaysLeft([battery(1, 80), battery(2, 78)], 5)).toBeNull();
    expect(bottleDaysLeft([battery(1, 60), battery(4, 90)], 5)).toBeNull();
  });

  it('never goes below zero days', () => {
    expect(bottleDaysLeft([battery(1, 20), battery(4, 5), battery(6, 3)], 5)).toBe(0);
  });

  it('groups charging voltage rows within fifteen minutes into one charge session', () => {
    const base = Date.UTC(2026, 9, 18, 6);
    const rows = (
      [
        [0, 3.6],
        [5, 3.7],
        [10, 3.8],
        [120, 3.9],
        [125, 4],
      ] as const
    ).map(([minutes, volt]) => ({ at: base + minutes * 60_000, volt }));
    const charges = bottleChargesFromVoltage(rows, (instant) =>
      instant < base + 60 * 60_000 ? 20 : 90,
    );
    expect(charges).toHaveLength(2);
    expect(charges[0]).toMatchObject({ gainedPct: 0, volts: [3.6, 3.7, 3.8] });
    expect(charges[1]?.volts).toStrictEqual([3.9, 4]);
    const withLevels = bottleChargesFromVoltage(rows.slice(0, 3), (instant) =>
      instant < base ? 20 : 95,
    );
    expect(withLevels[0]?.gainedPct).toBe(75);
    expect(bottleChargesFromVoltage([], () => 50)).toStrictEqual([]);
    expect(bottleChargesFromVoltage(rows.slice(0, 1), () => null)[0]?.gainedPct).toBe(0);
  });
});

describe('bottle fault names', () => {
  it('speaks plainly about known faults and admits an unknown one', () => {
    expect(bottleFaultName('uv_led_open')).toBe('UV light failed (open circuit)');
    expect(bottleFaultName('unknown_9')).toBe('Unknown fault');
  });
});
