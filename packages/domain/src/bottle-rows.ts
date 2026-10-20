import { z } from 'zod';
import { BOTTLE_FAULT_TYPES, BOTTLE_TRIGGERS, BOTTLE_UV_MODES, BOTTLE_VERDICTS } from './bottle';

const MOMENT = z.iso.datetime({ offset: true });

const COUNT = z.int().nonnegative();

export const BOTTLE_READING_KINDS = ['seed', 'small', 'drink', 'fill', 'rejected'] as const;

export type BottleReadingKind = (typeof BOTTLE_READING_KINDS)[number];

export const BOTTLE_READING_ROW = z.strictObject({
  at: MOMENT,
  trigger: z.string().min(1),
  distanceMm: COUNT,
  kcps: COUNT,
  ledOhm: z.number(),
  verdict: z.enum(BOTTLE_VERDICTS),
  volumeMl: COUNT.nullable(),
  kind: z.enum(BOTTLE_READING_KINDS),
  ml: COUNT.nullable(),
  drunkMl: COUNT.nullable(),
});

export type BottleReadingRow = z.infer<typeof BOTTLE_READING_ROW>;

export const BOTTLE_TRIGGER_NAMES: readonly string[] = BOTTLE_TRIGGERS;

export const BOTTLE_DRINK_ROW = z.strictObject({
  at: MOMENT,
  ml: COUNT,
  kind: z.enum(['drink', 'fill']),
  entryId: z.uuid().nullable(),
  levelMl: COUNT.nullable(),
});

export type BottleDrinkRow = z.infer<typeof BOTTLE_DRINK_ROW>;

export const BOTTLE_UV_ROW = z.strictObject({
  at: MOMENT,
  mode: z.string().min(1),
  socPct: COUNT,
});

export type BottleUvRow = z.infer<typeof BOTTLE_UV_ROW>;

export const BOTTLE_UV_MODE_NAMES: readonly string[] = BOTTLE_UV_MODES;

export const BOTTLE_FAULT_ROW = z.strictObject({
  at: MOMENT,
  type: z.string().min(1),
  known: z.boolean(),
  active: z.boolean(),
});

export type BottleFaultRow = z.infer<typeof BOTTLE_FAULT_ROW>;

export const BOTTLE_FAULT_NAMES: Readonly<Record<(typeof BOTTLE_FAULT_TYPES)[number], string>> = {
  uv_overtemp: 'UV light overheated',
  uv_led_short: 'UV light failed (short circuit)',
  uv_led_open: 'UV light failed (open circuit)',
  battery_temp: 'Battery too hot or cold',
  battery_open: 'Battery not connected',
  battery_short: 'Battery short circuit',
  ambient_light: 'Cap opened while cleaning',
};

export function bottleFaultName(type: string): string {
  const known = BOTTLE_FAULT_TYPES.find((candidate) => candidate === type);
  return known === undefined ? 'Unknown fault' : BOTTLE_FAULT_NAMES[known];
}

export const BOTTLE_BATTERY_POINT = z.strictObject({
  at: MOMENT,
  pct: z.int().min(0).max(100),
});

export type BottleBatteryPoint = z.infer<typeof BOTTLE_BATTERY_POINT>;

export const BOTTLE_CHARGE = z.strictObject({
  startAt: MOMENT,
  endAt: MOMENT,
  gainedPct: z.int().min(0).max(100),
  volts: z.array(z.number()),
});

export type BottleCharge = z.infer<typeof BOTTLE_CHARGE>;

const CHARGE_JUMP_PCT = 10;

const MS_PER_DAY = 86_400_000;

const DISCHARGE_DAYS = 14;

const MIN_DISCHARGE_DAYS = 2;

const CHARGE_GAP_MS = 15 * 60_000;

export function bottleChargesFromBattery(points: readonly BottleBatteryPoint[]): BottleCharge[] {
  const charges: BottleCharge[] = [];
  points.forEach((point, index) => {
    const before = points[index - 1];
    if (before !== undefined && point.pct - before.pct >= CHARGE_JUMP_PCT) {
      charges.push({
        startAt: before.at,
        endAt: point.at,
        gainedPct: point.pct - before.pct,
        volts: [],
      });
    }
  });
  return charges;
}

export interface BottleVoltPoint {
  readonly at: number;
  readonly volt: number;
}

interface VoltageRun {
  readonly first: number;
  last: number;
  readonly volts: number[];
}

export function bottleChargesFromVoltage(
  rows: readonly BottleVoltPoint[],
  batteryAt: (instantMs: number) => number | null,
): BottleCharge[] {
  const runs: VoltageRun[] = [];
  for (const row of [...rows].sort((left, right) => left.at - right.at)) {
    const run = runs.at(-1);
    if (run !== undefined && row.at - run.last <= CHARGE_GAP_MS) {
      run.last = row.at;
      run.volts.push(row.volt);
    } else {
      runs.push({ first: row.at, last: row.at, volts: [row.volt] });
    }
  }
  return runs.map((run) => {
    const start = batteryAt(run.first - 1);
    const end = batteryAt(run.last + 1);
    return {
      startAt: new Date(run.first).toISOString(),
      endAt: new Date(run.last).toISOString(),
      gainedPct: start === null || end === null ? 0 : Math.max(0, end - start),
      volts: run.volts,
    };
  });
}

export function bottleDaysLeft(
  points: readonly BottleBatteryPoint[],
  lockoutPct: number,
): number | null {
  const last = points[points.length - 1];
  if (last === undefined) {
    return null;
  }
  const horizon = Date.parse(last.at) - DISCHARGE_DAYS * MS_PER_DAY;
  let drop = 0;
  let span = 0;
  points.forEach((point, index) => {
    const before = points[index - 1];
    if (before === undefined || Date.parse(before.at) < horizon || point.pct > before.pct) {
      return;
    }
    drop += before.pct - point.pct;
    span += Date.parse(point.at) - Date.parse(before.at);
  });
  const days = span / MS_PER_DAY;
  if (days < MIN_DISCHARGE_DAYS || drop <= 0) {
    return null;
  }
  return Math.max(0, Math.round((last.pct - lockoutPct) / (drop / days)));
}

export const BOTTLE_SESSION = z.strictObject({
  startedAt: MOMENT,
  endedAt: MOMENT,
  open: z.boolean(),
  startMl: COUNT.nullable(),
  endMl: COUNT.nullable(),
  drunkMl: COUNT,
  drinks: COUNT,
  readings: COUNT,
  curve: z.array(z.strictObject({ at: MOMENT, ml: COUNT })),
});

export type BottleSession = z.infer<typeof BOTTLE_SESSION>;

function sessionStartedBy(row: BottleReadingRow): BottleSession {
  return {
    startedAt: row.at,
    endedAt: row.at,
    open: true,
    startMl: row.volumeMl,
    endMl: row.volumeMl,
    drunkMl: 0,
    drinks: 0,
    readings: 0,
    curve: [],
  };
}

function sessionExtendedBy(session: BottleSession, row: BottleReadingRow): BottleSession {
  const drank = row.kind === 'drink';
  return {
    ...session,
    endedAt: row.at,
    endMl: row.volumeMl,
    drunkMl: session.drunkMl + (drank ? (row.ml ?? 0) : 0),
    drinks: session.drinks + (drank ? 1 : 0),
    readings: session.readings + 1,
    curve: [...session.curve, ...(row.volumeMl === null ? [] : [{ at: row.at, ml: row.volumeMl }])],
  };
}

function sessionClosedBy(session: BottleSession, fill: BottleReadingRow): BottleSession {
  return { ...session, open: false, drunkMl: session.drunkMl + (fill.drunkMl ?? 0) };
}

export function bottleSessionsOf(rows: readonly BottleReadingRow[]): BottleSession[] {
  const sessions: BottleSession[] = [];
  for (const row of rows.filter((candidate) => candidate.verdict === 'accepted')) {
    const current = sessions.pop();
    if (current === undefined) {
      sessions.push(sessionExtendedBy(sessionStartedBy(row), row));
    } else if (row.kind === 'fill') {
      sessions.push(sessionClosedBy(current, row), sessionExtendedBy(sessionStartedBy(row), row));
    } else {
      sessions.push(sessionExtendedBy(current, row));
    }
  }
  return sessions.reverse();
}
