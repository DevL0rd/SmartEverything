import { randomUUID } from 'node:crypto';
import {
  bmiOf,
  bodyComposition,
  bodyFactsOf,
  type BrushingSession,
  type TreadmillSession,
} from '@smarteverything/domain';
import type { Seeded } from './store.ts';
import { daysAgo, type Anchor } from './clock.ts';
import type { Counted } from './context.ts';
import type { Random } from './random.ts';

const TREADMILL_DAYS = 70;
const BRUSHING_DAYS = 60;
const BOTTLE_DAYS = 30;
const BODY_DAYS = 80;
const SOURCE_ZONE = 0;
const BOTTLE_ML = 600;

interface Scene {
  readonly store: Seeded;
  readonly profiles: readonly string[];
  readonly anchor: Anchor;
  readonly rng: Random;
}

function deviceOf(deviceIds: ReadonlyMap<string, string>, key: string): string {
  const id = deviceIds.get(key);
  if (id === undefined) throw new Error(`Device ${key} was not stored.`);
  return id;
}

const ZONE_SHARES = {
  walk: { walk: 0.85, jog: 0.15, run: 0 },
  jog: { walk: 0.2, jog: 0.7, run: 0.1 },
  run: { walk: 0.1, jog: 0.3, run: 0.6 },
} as const;

function zonesOf(kind: 'walk' | 'jog' | 'run', seconds: number): TreadmillSession['zones'] {
  const share = ZONE_SHARES[kind];
  return {
    walk: Math.round(seconds * share.walk),
    jog: Math.round(seconds * share.jog),
    run: Math.round(seconds * share.run),
  };
}

function treadmillSession(
  deviceId: string,
  walker: string,
  start: Date,
  rng: Random,
): TreadmillSession {
  const activeSeconds = rng.int(18, 55) * 60;
  const pausedSeconds = rng.int(0, 150);
  const avgKmh = Math.round(rng.float(3.6, 8.4) * 10) / 10;
  const maxKmh = Math.round((avgKmh + rng.float(0.4, 2)) * 10) / 10;
  const distanceM = Math.round((avgKmh * activeSeconds) / 3.6);
  const kind = avgKmh < 5 ? 'walk' : avgKmh < 7 ? 'jog' : 'run';
  const zones = zonesOf(kind, activeSeconds);
  const kcal = Math.round(distanceM * 0.06);
  const splits = Array.from({ length: Math.floor(distanceM / 1000) }, () =>
    Math.round((3600 / avgKmh) * rng.float(0.94, 1.06)),
  );
  return {
    id: randomUUID(),
    deviceId,
    walkerProfileId: walker,
    startedAt: start.toISOString(),
    endedAt: new Date(start.getTime() + (activeSeconds + pausedSeconds) * 1000).toISOString(),
    zoneOffsetSeconds: SOURCE_ZONE,
    activeSeconds,
    pausedSeconds,
    distanceM,
    steps: Math.round(distanceM / 0.75),
    kcal,
    kcalNet: Math.round(kcal * 0.7),
    avgKmh,
    maxKmh,
    mode: 'manual',
    kind,
    zones,
    splits,
    source: 'live',
    climbM: null,
    inclineAvg: null,
    inclineMax: null,
    inclineSeconds: {},
    kcalSource: 'belt',
    kcalEstimate: null,
    heartRateSource: null,
  };
}

function seedTreadmill(scene: Scene, deviceId: string): number {
  const { store, profiles, anchor, rng } = scene;
  let rows = 0;
  for (let day = 1; day <= TREADMILL_DAYS; day += 1) {
    const walker = profiles[day % profiles.length];
    if (walker === undefined || !rng.chance(0.55)) continue;
    const start = daysAgo(anchor, day, rng.int(6, 20), rng.int(0, 59));
    store.treadmillSessions.add(treadmillSession(deviceId, walker, start, rng));
    rows += 1;
  }
  return rows;
}

function brushing(deviceId: string, person: string, start: Date, rng: Random): BrushingSession {
  const routineS = 120;
  const complete = rng.chance(0.88);
  return {
    id: randomUUID(),
    deviceId,
    personId: person,
    handleSessionId: null,
    startedAt: start.toISOString(),
    zoneOffsetSeconds: SOURCE_ZONE,
    durationS: complete ? routineS + rng.int(0, 12) : rng.int(40, 100),
    routineS,
    mode: rng.chance(0.8) ? 'clean' : 'gum_health',
    intensity: rng.pick(['low', 'medium', 'high'] as const),
    source: 'observed',
    complete,
    pressure: {
      excessS: rng.int(0, 10),
      optimalS: rng.int(80, 115),
      strip: [],
    },
    zones: [30, 30, 30, 30].map((seconds) => seconds + rng.int(-6, 6)),
    headSerial: null,
    details: {
      zoneSource: 'estimated',
      face: null,
      batteryEnd: null,
      handleUser: null,
      sectors: 4,
    },
  };
}

function seedBrushing(scene: Scene, deviceId: string): number {
  const { store, profiles, anchor, rng } = scene;
  let rows = 0;
  for (let day = 1; day <= BRUSHING_DAYS; day += 1) {
    for (const person of profiles) {
      for (const hour of [7, 21]) {
        if (!rng.chance(0.85)) continue;
        const start = daysAgo(anchor, day, hour, rng.int(0, 40));
        store.brushingSessions.add(brushing(deviceId, person, start, rng));
        rows += 1;
      }
    }
  }
  return rows;
}

interface Pour {
  readonly at: number;
  readonly kind: 'drink' | 'fill';
  readonly ml: number;
  readonly level: number;
  readonly distanceMm: number;
}

function recordPour(scene: Scene, deviceId: string, pour: Pour): number {
  const { store, profiles } = scene;
  store.bottleReadings.insert(deviceId, {
    at: pour.at,
    trigger: 'seed',
    distanceMm: pour.distanceMm,
    kcps: 4200,
    ledOhm: 1800,
    verdict: 'accepted',
    volumeMl: pour.level,
    kind: pour.kind,
    eventMl: pour.ml,
    drunkMl: pour.kind === 'drink' ? pour.ml : null,
  });
  const stored = store.bottleReadings.insertDrink(deviceId, {
    at: pour.at,
    kind: pour.kind,
    ml: pour.ml,
    levelMl: pour.level,
    profileId: profiles[0] ?? null,
    entryId: null,
  });
  return stored ? 1 : 0;
}

function seedBottle(scene: Scene, deviceId: string): { readings: number; drinks: number } {
  const { anchor, rng } = scene;
  let readings = 0;
  let drinks = 0;
  for (let day = 0; day < BOTTLE_DAYS; day += 1) {
    const morning = Math.floor(daysAgo(anchor, day, 7).getTime() / 1000);
    let level = BOTTLE_ML;
    drinks += recordPour(scene, deviceId, {
      at: morning,
      kind: 'fill',
      ml: BOTTLE_ML,
      level,
      distanceMm: 60,
    });
    readings += 1;
    for (let sip = 1; sip <= rng.int(4, 8); sip += 1) {
      const ml = rng.int(60, 180);
      if (level - ml < 40) break;
      level -= ml;
      drinks += recordPour(scene, deviceId, {
        at: morning + sip * rng.int(1500, 5400),
        kind: 'drink',
        ml,
        level,
        distanceMm: Math.round(60 + (BOTTLE_ML - level) / 4),
      });
      readings += 1;
    }
  }
  return { readings, drinks };
}

const SCALE_FACTS = [
  { sex: 'male', birth_date: '1988-06-21', height_cm: 178 },
  { sex: 'female', birth_date: '1990-04-12', height_cm: 168 },
  { sex: 'male', birth_date: '1987-09-03', height_cm: 181 },
] as const;

function seedBody(scene: Scene, deviceId: string): number {
  const { store, profiles, anchor, rng } = scene;
  let rows = 0;
  profiles.forEach((profileId, index) => {
    const facts = SCALE_FACTS[index % SCALE_FACTS.length];
    if (facts === undefined) return;
    const body = bodyFactsOf(facts, anchor.now);
    if (body === null) return;
    const base = 58 + index * 12 + rng.float(0, 8);
    for (let day = BODY_DAYS; day >= 1; day -= 3) {
      const weightKg =
        Math.round((base - (BODY_DAYS - day) * 0.01 + rng.float(-0.6, 0.6)) * 10) / 10;
      const impedance = Math.round(rng.float(430, 560));
      const measuredAt = daysAgo(anchor, day, 7, rng.int(0, 30));
      const { after } = store.bodyReadings.merge({
        deviceId,
        measuredAt: measuredAt.toISOString(),
        scaleUser: index + 1,
        weightKg,
        heartRate: rng.int(58, 72),
        impedance,
      });
      store.bodyReadings.own(after.id, {
        profileId,
        attribution: 'person',
        bmi: bmiOf(weightKg, body.heightCm),
        composition: bodyComposition({
          ...body,
          weightKg,
          impedanceLow: impedance,
          impedanceHigh: null,
        }),
      });
      rows += 1;
    }
  });
  return rows;
}

export function seedActivity(
  store: Seeded,
  household: {
    readonly profiles: readonly string[];
    readonly deviceIds: ReadonlyMap<string, string>;
  },
  anchor: Anchor,
  rng: (label: string) => Random,
): Counted {
  const { profiles, deviceIds } = household;
  const at = (label: string): Scene => ({ store, profiles, anchor, rng: rng(label) });
  const bottle = seedBottle(at('bottle'), deviceOf(deviceIds, 'kt-bottle'));
  return {
    treadmillSessions: seedTreadmill(at('treadmill'), deviceOf(deviceIds, 'of-treadmill')),
    brushingSessions: seedBrushing(at('brushing'), deviceOf(deviceIds, 'ba-toothbrush')),
    bottleReadings: bottle.readings,
    bottleDrinks: bottle.drinks,
    bodyReadings: seedBody(at('body'), deviceOf(deviceIds, 'ba-scale')),
  };
}
