import { appendTo } from '@smarteverything/domain';
import { extent, max } from 'd3-array';
import type { HealthRecord } from '@smarteverything/domain';
import { recordsOfType } from './records';
import { MINUTE_MS, dayKeyOf } from '../../../format/time';
import type { HeartSample } from './workouts';

export const ZONES = [
  { key: 'warm', label: 'Warm-up', from: 0.5 },
  { key: 'easy', label: 'Fat burn', from: 0.6 },
  { key: 'aerobic', label: 'Cardio', from: 0.7 },
  { key: 'hard', label: 'Hard', from: 0.8 },
  { key: 'peak', label: 'Peak', from: 0.9 },
] as const;

export type ZoneKey = (typeof ZONES)[number]['key'];

export type ZoneMinutes = Readonly<Record<ZoneKey, number>>;

const SAMPLE_GAP_LIMIT_MS = 5 * MINUTE_MS;
const LONE_SAMPLE_MS = MINUTE_MS;

export function heartSamplesOf(records: readonly HealthRecord[]): HeartSample[] {
  return recordsOfType(records, 'HeartRate')
    .flatMap((record) =>
      record.data.samples.map((sample) => ({ at: Date.parse(sample.time), bpm: sample.bpm })),
    )
    .sort((left, right) => left.at - right.at);
}

export function zoneOf(bpm: number, maximum: number): ZoneKey | null {
  const share = bpm / maximum;
  let found: ZoneKey | null = null;
  for (const zone of ZONES) {
    if (share >= zone.from) {
      found = zone.key;
    }
  }
  return found;
}

function emptyZones(): Record<ZoneKey, number> {
  return { warm: 0, easy: 0, aerobic: 0, hard: 0, peak: 0 };
}

export function zoneMinutes(samples: readonly HeartSample[], maximum: number): ZoneMinutes {
  const totals = emptyZones();
  samples.forEach((sample, index) => {
    const next = samples[index + 1];
    const gap = next === undefined ? LONE_SAMPLE_MS : next.at - sample.at;
    const zone = zoneOf(sample.bpm, maximum);
    if (zone !== null) {
      totals[zone] += Math.min(gap, SAMPLE_GAP_LIMIT_MS) / MINUTE_MS;
    }
  });
  return totals;
}

export function zoneMinutesByDay(
  samples: readonly HeartSample[],
  maximum: number,
): ReadonlyMap<string, ZoneMinutes> {
  const byDay = new Map<string, HeartSample[]>();
  for (const sample of samples) {
    const day = dayKeyOf(sample.at);
    appendTo(byDay, day, sample);
  }
  return new Map([...byDay.entries()].map(([day, list]) => [day, zoneMinutes(list, maximum)]));
}

export interface MaximumHeartRate {
  readonly bpm: number;
  readonly basis: 'setting' | 'observed';
}

export function maximumHeartRate(
  setting: number | null,
  observed: readonly number[],
): MaximumHeartRate | null {
  if (setting !== null) {
    return { bpm: setting, basis: 'setting' };
  }
  const highest = max(observed);
  return highest === undefined ? null : { bpm: highest, basis: 'observed' };
}

export function latestSample(samples: readonly HeartSample[]): HeartSample | null {
  return samples.reduce<HeartSample | null>(
    (latest, sample) => (latest === null || sample.at >= latest.at ? sample : latest),
    null,
  );
}

export function minutesAbove(zones: ZoneMinutes, from: ZoneKey): number {
  const start = ZONES.findIndex((zone) => zone.key === from);
  return ZONES.slice(start).reduce((sum, zone) => sum + zones[zone.key], 0);
}

export interface SampleStats {
  readonly min: number;
  readonly mean: number;
  readonly max: number;
}

export function sampleStats(samples: readonly HeartSample[]): SampleStats | null {
  const [lowest, highest] = extent(samples, (sample) => sample.bpm);
  if (lowest === undefined) {
    return null;
  }
  return {
    min: lowest,
    mean: samples.reduce((sum, sample) => sum + sample.bpm, 0) / samples.length,
    max: highest,
  };
}

export interface ZoneDay {
  readonly day: string;
  readonly label: string;
  readonly zones: ZoneMinutes;
  readonly total: number;
}

export function zoneDays(
  samples: readonly HeartSample[],
  maximum: number,
  days: readonly { readonly day: string; readonly label: string }[],
): ZoneDay[] {
  const byDay = zoneMinutesByDay(samples, maximum);
  return days.map(({ day, label }) => {
    const zones = byDay.get(day) ?? emptyZones();
    return { day, label, zones, total: ZONES.reduce((sum, zone) => sum + zones[zone.key], 0) };
  });
}

export function zoneTotals(days: readonly ZoneDay[]): ZoneMinutes {
  const totals = emptyZones();
  for (const entry of days) {
    for (const zone of ZONES) {
      totals[zone.key] += entry.zones[zone.key];
    }
  }
  return totals;
}
