import type { HealthRecord } from '@smarteverything/domain';
import { z } from 'zod';
import { endOf, startOf } from './records';
import type { SeriesSpec } from './series-spec';
import { HOUR_MS, MINUTE_MS, startOfDayKey } from '../../../format/time';

export interface Point {
  readonly at: number;
  readonly value: number;
  readonly low: number;
  readonly high: number;
}

export interface DailyFigure {
  readonly day: string;
  readonly metric: string;
  readonly value: number;
}

const DATA = z.record(z.string(), z.unknown());
const AMOUNT = z.number().nullable();
const SAMPLES = z.array(z.object({ time: z.string() }).catchall(z.unknown()));

function single(at: number, value: number): Point {
  return { at, value, low: value, high: value };
}

function fieldPoints(
  record: HealthRecord,
  field: string,
  second: string | undefined,
): readonly Point[] {
  const data = DATA.parse(record.data);
  const value = AMOUNT.parse(data[field]);
  if (value === null) {
    return [];
  }
  if (second === undefined) {
    return [single(startOf(record), value)];
  }
  const low = z.number().parse(data[second]);
  return [{ at: startOf(record), value, low, high: value }];
}

function samplePoints(record: HealthRecord, list: string, field: string): readonly Point[] {
  const samples = SAMPLES.parse(DATA.parse(record.data)[list]);
  return samples.map((sample) => single(Date.parse(sample.time), z.number().parse(sample[field])));
}

export function pointsOfRecord(spec: SeriesSpec, record: HealthRecord): readonly Point[] {
  const read = spec.read;
  switch (read.kind) {
    case 'field':
      return fieldPoints(record, read.field, read.second);
    case 'samples':
      return samplePoints(record, read.list, read.field);
    case 'duration': {
      const at = record.type === 'SleepSession' ? endOf(record) : startOf(record);
      return [single(at, (endOf(record) - startOf(record)) / MINUTE_MS)];
    }
    case 'occurrence':
      return [single(startOf(record), 1)];
  }
}

export function pointsOfRecords(
  spec: SeriesSpec,
  records: readonly HealthRecord[],
): readonly Point[] {
  return records
    .filter((record) => record.type === spec.type)
    .flatMap((record) => pointsOfRecord(spec, record))
    .sort((left, right) => left.at - right.at);
}

function figureOf(figures: readonly DailyFigure[], day: string, metric: string): number | null {
  return figures.find((figure) => figure.day === day && figure.metric === metric)?.value ?? null;
}

export function pointsOfDaily(spec: SeriesSpec, figures: readonly DailyFigure[]): readonly Point[] {
  const metric = spec.daily;
  if (metric === null) {
    return [];
  }
  const range = spec.dailyRange;
  return figures
    .filter((figure) => figure.metric === metric)
    .map((figure) => {
      const at = startOfDayKey(figure.day) + 12 * HOUR_MS;
      if (range === null) {
        return single(at, figure.value);
      }
      return {
        at,
        value: figure.value,
        low: figureOf(figures, figure.day, range.min) ?? figure.value,
        high: figureOf(figures, figure.day, range.max) ?? figure.value,
      };
    })
    .sort((left, right) => left.at - right.at);
}
