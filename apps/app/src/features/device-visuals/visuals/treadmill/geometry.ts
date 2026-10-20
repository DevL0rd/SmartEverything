import { zoneOf, type SpeedZone } from '@smarteverything/domain';
import type { ColourRole } from '../../../../design/tokens';
import { TREADMILL_ZONE_COLOUR } from '../../model/treadmill-look';

export const VIEW = { w: 400, h: 384 } as const;
export const FLOOR_Y = 362;
export const PIVOT = { x: 40, y: 356 } as const;
export const BELT_Y = 316;
export const MACHINE_MM = 1632;
export const MACHINE_UNITS = 350;
export const UNITS_PER_METER = (MACHINE_UNITS * 1000) / MACHINE_MM;
export const SEAM_PERIOD = 28;
export const SEAMS_PER_CYCLE = 4;
export const TEXTURE_TRAVEL = SEAM_PERIOD * SEAMS_PER_CYCLE;
export const WALKER_X = 114;
export const LIFT_X = 336;
export const HEART_MAX_BPM = 188;
export const SPRING_SETTLE_MS = 1000;

const DEGREES = 180 / Math.PI;
const FLIGHT_FROM_KMH = 8;
const CADENCE_BASE = 88;
const CADENCE_PER_KMH = 6.5;
const MS_PER_MINUTE = 60_000;
const STEPS_PER_STRIDE = 2;

export const HEART_ZONE_FROM: readonly number[] = [0.5, 0.6, 0.7, 0.8, 0.9];

export const HEART_ZONE_ROLES: readonly ColourRole[] = [
  'viz-6',
  'viz-1',
  'viz-5',
  'viz-2',
  'critical',
];

export interface Point {
  readonly x: number;
  readonly y: number;
}

export interface Gait {
  readonly amp: number;
  readonly bend: number;
  readonly arm: number;
  readonly elbow: number;
  readonly lean: number;
  readonly hop: number;
}

interface Anchor {
  readonly kmh: number;
  readonly gait: Gait;
}

const ANCHORS: readonly [Anchor, Anchor, Anchor] = [
  { kmh: 4, gait: { amp: 22, bend: 58, arm: 18, elbow: 42, lean: 2, hop: 0 } },
  { kmh: 8, gait: { amp: 32, bend: 86, arm: 30, elbow: 76, lean: 6, hop: 0 } },
  { kmh: 12, gait: { amp: 42, bend: 112, arm: 44, elbow: 96, lean: 10, hop: 5.5 } },
];

export function tiltDegrees(gradePercent: number): number {
  return Math.atan(Math.max(0, gradePercent) / 100) * DEGREES;
}

export function beltRate(speedKmh: number): number {
  return (Math.max(0, speedKmh) / 3.6) * UNITS_PER_METER;
}

export function beltCycleMs(speedKmh: number): number | null {
  const rate = beltRate(speedKmh);
  return rate > 0 ? (TEXTURE_TRAVEL / rate) * 1000 : null;
}

export function cadenceOf(cadence: number | null, speedKmh: number): number {
  return cadence !== null && cadence > 0
    ? cadence
    : CADENCE_BASE + Math.max(speedKmh, 1) * CADENCE_PER_KMH;
}

export function strideCycleMs(cadence: number): number {
  return (STEPS_PER_STRIDE * MS_PER_MINUTE) / cadence;
}

function lerp(from: number, to: number, share: number): number {
  return from + (to - from) * share;
}

function blend(low: Gait, high: Gait, share: number): Gait {
  return {
    amp: lerp(low.amp, high.amp, share),
    bend: lerp(low.bend, high.bend, share),
    arm: lerp(low.arm, high.arm, share),
    elbow: lerp(low.elbow, high.elbow, share),
    lean: lerp(low.lean, high.lean, share),
    hop: lerp(low.hop, high.hop, share),
  };
}

export function gaitOf(speedKmh: number): Gait {
  const [first, middle, last] = ANCHORS;
  const low = speedKmh < middle.kmh ? first : middle;
  const high = speedKmh < middle.kmh ? middle : last;
  const share = Math.min(1, Math.max(0, (speedKmh - low.kmh) / (high.kmh - low.kmh)));
  const gait = blend(low.gait, high.gait, share);
  return speedKmh > FLIGHT_FROM_KMH ? gait : { ...gait, hop: 0 };
}

export function heartZoneOf(bpm: number | null, maxBpm = HEART_MAX_BPM): number | null {
  if (bpm === null || bpm <= 0) {
    return null;
  }
  const share = bpm / maxBpm;
  const index = HEART_ZONE_FROM.findLastIndex((from) => share >= from);
  return index < 0 ? null : index;
}

export function rotateAbout(point: Point, degrees: number): Point {
  const turn = degrees / DEGREES;
  const dx = point.x - PIVOT.x;
  const dy = point.y - PIVOT.y;
  return {
    x: PIVOT.x + dx * Math.cos(turn) + dy * Math.sin(turn),
    y: PIVOT.y - dx * Math.sin(turn) + dy * Math.cos(turn),
  };
}

export function glowRole(zone: SpeedZone, heartZone: number | null): ColourRole {
  const heart = heartZone === null ? undefined : HEART_ZONE_ROLES[heartZone];
  return heart ?? TREADMILL_ZONE_COLOUR[zone];
}

const GAIT_WORDS: Readonly<Record<SpeedZone, 'walking' | 'jogging' | 'running'>> = {
  walk: 'walking',
  jog: 'jogging',
  run: 'running',
};

export function gaitWord(speedKmh: number): 'walking' | 'jogging' | 'running' {
  return GAIT_WORDS[zoneOf(speedKmh)];
}
