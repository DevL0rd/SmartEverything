import {
  BOTTLE_CARE_VIEW,
  BOTTLE_SETTINGS_VIEW,
  BOTTLE_STATS,
  BOTTLE_STATUS_VIEW,
  bottleDayAfter,
  type BottleCareView,
  type BottleSettingsView,
  type BottleStats,
  type BottleStatusView,
} from '@smarteverything/domain';

export const NOW = Date.parse('2026-10-18T15:42:00+02:00');

export const TODAY = '2026-10-18';

export const DEVICE_ID = '7b0f9d7e-2a4f-4a39-9d2a-6a0a1d3d9c11';

export const PERSON_ID = '0b8f4a0e-1c7a-4a6f-8a10-5d3b0d2f7a21';

const DRINKS = [
  { at: '2026-10-18T07:41:00+02:00', ml: 180, levelMl: 500 },
  { at: '2026-10-18T09:20:00+02:00', ml: 140, levelMl: 360 },
  { at: '2026-10-18T11:30:00+02:00', ml: 200, levelMl: 160 },
  { at: '2026-10-18T14:31:00+02:00', ml: 160, levelMl: 520 },
] as const;

const HOURLY = Array.from({ length: 24 }, (_, hour) => {
  const drink = DRINKS.find((entry) => Number(entry.at.slice(11, 13)) === hour);
  return drink === undefined ? 0 : drink.ml;
});

const CAP = {
  state: 'on',
  stateCode: 0,
  at: '2026-10-18T15:30:00+02:00',
  charging: 'not_charging',
  batteryPct: 82,
  daysLeft: 23,
  lowBattery: false,
  locked: false,
  interlock: false,
  cleaning: false,
  fault: null,
} as const;

const TODAY_VIEW = {
  day: TODAY,
  goalMl: 2600,
  totalMl: 1075,
  bottleMl: 680,
  loggedMl: 250,
  otherMl: 145,
  hourly: HOURLY,
  drinks: DRINKS.map((drink, index) => ({
    ...drink,
    kind: 'drink',
    entryId: `5a1e0c4d-6b7f-4c2a-8d3e-00000000000${String(index + 1)}`,
  })),
  fills: [{ at: '2026-10-18T12:00:00+02:00', ml: 680, kind: 'fill', entryId: null, levelMl: 680 }],
  levels: [],
  lastDrinkAt: '2026-10-18T14:31:00+02:00',
  paceFromMinute: 420,
  paceToMinute: 1320,
} as const;

const SETTINGS = {
  reminder: {
    state: 'interval_fixed',
    intervalMin: 45,
    from: '08:00',
    to: '21:00',
    colour: '#46b8ff',
  },
  quiet: { state: 'auto', from: '22:00', to: '07:00', snoozeMin: 0 },
} as const;

const IDENTITY = {
  view: 'status',
  deviceId: DEVICE_ID,
  name: 'Kitchen bottle',
  room: 'Kitchen',
  model: 'larq.bottle.purevis2',
  body: 680,
  person: { id: PERSON_ID, name: 'Ida' },
  boundBy: null,
  noticePending: false,
  holder: { name: 'Pixel', isYou: true },
} as const;

const SYNC = {
  link: 'asleep',
  lastSeenAt: '2026-10-18T15:30:00+02:00',
  lastSyncAt: '2026-10-18T15:30:00+02:00',
  lastSyncOutcome: 'ok',
  lastSyncDetail: null,
  firstSyncPending: false,
  clockDriftSeconds: 2,
  firmware: '1.13.0',
  historyFrom: '2026-09-02T08:00:00+02:00',
} as const;

export function statusOf(overrides: Readonly<Record<string, unknown>> = {}): BottleStatusView {
  return BOTTLE_STATUS_VIEW.parse({
    ...IDENTITY,
    ...SYNC,
    level: { ml: 520, pct: 76, at: '2026-10-18T14:31:00+02:00', reliable: true, quality: 'good' },
    cap: CAP,
    orientation: null,
    uv: { lastAt: '2026-10-17T22:05:00+02:00', lastMode: 'normal' },
    today: TODAY_VIEW,
    reminder: SETTINGS.reminder,
    quiet: SETTINGS.quiet,
    pending: { reminder: false, quiet: false },
    filter: null,
    mayStartUv: true,
    uvRefusal: null,
    maySettings: true,
    ...overrides,
  });
}

function barsOf(count: number): Record<string, unknown>[] {
  return Array.from({ length: count }, (_, index) => {
    const total = 1500 + ((index * 337) % 1400);
    return {
      key: bottleDayAfter(TODAY, index - count + 1),
      totalMl: total,
      previousMl: 1800 + ((index * 211) % 900),
      goalMl: 2600,
      goalMet: total >= 2600,
      parts: { bottleMl: total * 0.6, loggedMl: total * 0.25, otherMl: total * 0.15 },
    };
  });
}

const COMPARE = { value: 2140, previous: 1980, deltaPct: 8 } as const;

const DAILY_AVERAGES = {
  drinksPerDay: 6.2,
  fillsPerDay: 2.1,
  litresPerDay: 1.4,
  longestGapMin: 170,
};

const HEATMAP = Array.from({ length: 371 }, (_, index) => ({
  day: bottleDayAfter(TODAY, index - 370),
  ml: (index * 173) % 3100,
  goalMl: 2600,
}));

const RHYTHM = Array.from({ length: 7 }, (_, row) =>
  Array.from({ length: 24 }, (_, hour) => (hour > 6 && hour < 22 ? ((row + hour) % 5) * 60 : 0)),
);

const DAILY = Array.from({ length: 30 }, (_, index) => ({
  day: bottleDayAfter(TODAY, index - 29),
  drinks: 4 + (index % 6),
  longestGapMin: 120 + ((index * 17) % 90),
  firstMinute: 450 + (index % 5) * 10,
  lastMinute: 1230 + (index % 4) * 15,
  fills: 1 + (index % 3),
  litresFilled: 0.68 * (1 + (index % 3)),
}));

const STREAK = {
  current: 3,
  atRisk: false,
  longest: 9,
  longestEnd: bottleDayAfter(TODAY, -20),
  completion30: Array.from({ length: 30 }, (_, index) => index % 4 !== 0),
};

const CHIPS = {
  total: COMPARE,
  perDay: COMPARE,
  drinks: { value: 43, previous: 38, deltaPct: 13 },
  drinkSize: { value: 165, previous: 172, deltaPct: -4 },
};

export function statsOf(overrides: Readonly<Record<string, unknown>> = {}): BottleStats {
  return BOTTLE_STATS.parse({
    view: 'stats',
    range: 'week',
    today: TODAY,
    window: { from: bottleDayAfter(TODAY, -6), to: TODAY },
    previousWindow: { from: bottleDayAfter(TODAY, -13), to: bottleDayAfter(TODAY, -7) },
    goalMl: 2600,
    chips: CHIPS,
    bars: barsOf(7),
    averages: { sevenDayMl: 2140, thirtyDayMl: 2010 },
    heatmap: HEATMAP,
    rhythm: RHYTHM,
    sizes: {
      binMl: 20,
      bins: [0, 1, 3, 6, 9, 12, 8, 5, 3, 2, 1, 0, 0, 0, 0],
      medianMl: 150,
      count: 50,
    },
    daily: DAILY,
    dailyAverages: DAILY_AVERAGES,
    previousDailyAverages: { ...DAILY_AVERAGES, drinksPerDay: 5.8 },
    streak: STREAK,
    bests: {
      bestDay: { day: bottleDayAfter(TODAY, -5), ml: 3150 },
      bestWeek: { from: bottleDayAfter(TODAY, -27), ml: 17900 },
    },
    sources: { bottleMl: 9100, loggedMl: 3900, otherMl: 2000 },
    ...overrides,
  });
}

export function careOf(overrides: Readonly<Record<string, unknown>> = {}): BottleCareView {
  return BOTTLE_CARE_VIEW.parse({
    view: 'care',
    uvDays: Array.from({ length: 30 }, (_, index) => ({
      day: bottleDayAfter(TODAY, index - 29),
      maintenance: index % 3 === 0 ? 1 : 0,
      normal: index % 2,
      adventure: index % 7 === 0 ? 1 : 0,
    })),
    uvRecent: [{ at: '2026-10-17T22:05:00+02:00', mode: 'normal', socPct: 84 }],
    battery: {
      pct: 82,
      alertPct: 20,
      lockoutPct: 10,
      points: Array.from({ length: 12 }, (_, index) => ({
        at: `2026-10-${String(7 + index).padStart(2, '0')}T08:00:00+02:00`,
        pct: 100 - index * 2,
      })),
      charges: [
        {
          startAt: '2026-10-09T21:00:00+02:00',
          endAt: '2026-10-09T23:10:00+02:00',
          gainedPct: 40,
          volts: [3.6, 3.9, 4.1, 4.2],
        },
      ],
      chargeCycles: 3,
      daysLeft: 23,
    },
    filter: {
      type: 'essential',
      installedOn: '2026-09-20',
      litresUsed: 21,
      litresLimit: 94,
      daysUsed: 28,
      daysLimit: 60,
      usedPct: 0.47,
      replaceBy: '2026-11-19',
      due: false,
    },
    faults: [],
    ...overrides,
  });
}

export function settingsOf(overrides: Readonly<Record<string, unknown>> = {}): BottleSettingsView {
  return BOTTLE_SETTINGS_VIEW.parse({
    view: 'settings',
    deviceId: DEVICE_ID,
    name: 'Kitchen bottle',
    room: 'Kitchen',
    person: { id: PERSON_ID, name: 'Ida' },
    body: 680,
    goalMl: 2600,
    reminder: {
      state: 'interval_fixed',
      intervalMin: 45,
      from: '08:00',
      to: '21:00',
      colour: '#46b8ff',
    },
    quiet: { state: 'auto', from: '22:00', to: '07:00', snoozeMin: 0 },
    pending: { reminder: null, quiet: null },
    filterConfig: { installed: true, type: 'essential', installedOn: '2026-09-20' },
    filter: null,
    calibration: null,
    holder: { name: 'Pixel', isYou: true },
    syncs: [],
    mayEdit: true,
    mayBind: true,
    ...overrides,
  });
}
