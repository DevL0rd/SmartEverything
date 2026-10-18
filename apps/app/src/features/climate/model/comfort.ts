import { withRole, type PresentedCapability } from '@smarteverything/domain';
import type { StatusTone } from '../../../components/tone';
import { decimal } from '../../../format/number';
import { BANDS, comparable, zoneOf, type ComfortMetric } from './bands';
import type { ClimateSource } from './climate-devices';

export type { ComfortMetric };

export const INDOOR_METRICS: readonly ComfortMetric[] = ['temperature', 'humidity', 'co2'];

export interface MetricReading {
  readonly metric: ComfortMetric;
  readonly label: string;
  readonly amount: number;
  readonly value: string;
  readonly unit: string | null;
  readonly verdict: string;
  readonly tone: StatusTone;
  readonly stale: boolean;
}

export interface RoomComfort {
  readonly roomId: string | null;
  readonly room: string | null;
  readonly readings: readonly MetricReading[];
}

interface Sample {
  readonly presented: PresentedCapability;
  readonly value: number;
  readonly online: boolean;
}

const DIGITS: Readonly<Record<ComfortMetric, number>> = {
  temperature: 1,
  humidity: 0,
  pm25: 0,
  co2: 0,
};

function samplesOf(sources: readonly ClimateSource[], metric: ComfortMetric): readonly Sample[] {
  return sources.flatMap((source) => {
    const presented = withRole(source.model.presentation, metric);
    const value = presented === undefined ? undefined : source.values[presented.key]?.value;
    return presented !== undefined && typeof value === 'number' && Number.isFinite(value)
      ? [{ presented, value, online: source.model.device.online }]
      : [];
  });
}

function readingOf(metric: ComfortMetric, samples: readonly Sample[]): MetricReading | null {
  const online = samples.filter((sample) => sample.online);
  const used = online.length > 0 ? online : samples;
  const first = used[0];
  if (first === undefined) {
    return null;
  }
  const mean = used.reduce((sum, sample) => sum + sample.value, 0) / used.length;
  const zone = zoneOf(BANDS[metric], comparable(mean, first.presented.unit));
  return {
    metric,
    label: first.presented.label,
    amount: mean,
    value: decimal(mean, DIGITS[metric]),
    unit: first.presented.unit,
    verdict: zone.verdict,
    tone: zone.tone,
    stale: online.length === 0,
  };
}

export function readingsOf(
  sources: readonly ClimateSource[],
  metrics: readonly ComfortMetric[],
): readonly MetricReading[] {
  return metrics.flatMap((metric) => {
    const reading = readingOf(metric, samplesOf(sources, metric));
    return reading === null ? [] : [reading];
  });
}

export function comfortOf(
  sources: readonly ClimateSource[],
  rooms: readonly { readonly id: string; readonly name: string }[],
  metrics: readonly ComfortMetric[],
): readonly RoomComfort[] {
  const perRoom = rooms.flatMap((room): RoomComfort[] => {
    const readings = readingsOf(
      sources.filter((source) => source.model.device.room_id === room.id),
      metrics,
    );
    return readings.length === 0 ? [] : [{ roomId: room.id, room: room.name, readings }];
  });
  if (perRoom.length >= 2) {
    return perRoom;
  }
  const readings = readingsOf(sources, metrics);
  return readings.length === 0 ? [] : [{ roomId: null, room: null, readings }];
}
