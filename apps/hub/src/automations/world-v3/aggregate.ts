import {
  JSON_VALUE,
  jsonEquals,
  type CapabilityKey,
  type DeviceRow,
  type JsonValue,
} from '@smarteverything/domain';
import { z } from 'zod';
import { controlKey, controlValue, hasReadableControl, lastChange } from './device-reads';
import { parseInputs } from './inputs';
import { ReadFailure, outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { TARGET_VALUE, deviceRefs } from './refs';
import { devicesOf } from './targets';
import type { WorldReadDeps } from './deps';

export const AGGREGATE_FUNCTION_IDS = [
  'any',
  'all',
  'none',
  'count',
  'average',
  'min',
  'max',
  'sum',
  'latest',
] as const;

const AGGREGATE = z.object({
  target: TARGET_VALUE,
  control: z.string().min(1),
  fn: z.enum(AGGREGATE_FUNCTION_IDS),
  matches: JSON_VALUE.optional(),
});

interface Reading {
  readonly device: DeviceRow;
  readonly value: JsonValue | undefined;
}

function controlReadings(
  deps: WorldReadDeps,
  devices: readonly DeviceRow[],
  control: CapabilityKey,
): readonly Reading[] {
  return devices
    .filter((device) => hasReadableControl(device, control))
    .map((device) => ({ device, value: controlValue(deps, device, control) }));
}

function numeric(readings: readonly Reading[]): readonly { device: DeviceRow; value: number }[] {
  return readings.flatMap(({ device, value }) => {
    if (value === undefined) return [];
    if (typeof value !== 'number') {
      throw new ReadFailure(
        'TypeError',
        `${device.name} gives ${JSON.stringify(value)}, not a number`,
      );
    }
    return [{ device, value }];
  });
}

function summed(entries: readonly { value: number }[]): number {
  return entries.reduce((total, entry) => total + entry.value, 0);
}

function numericResult(fn: string, readings: readonly Reading[]): ReadResult {
  const entries = numeric(readings);
  const values = entries.map((entry) => entry.value);
  const none = values.length === 0;
  const results: Readonly<Record<string, JsonValue>> = {
    average: none ? null : summed(entries) / values.length,
    min: none ? null : Math.min(...values),
    max: none ? null : Math.max(...values),
    sum: summed(entries),
  };
  return outputsOf({
    value: results[fn],
    count: entries.length,
    matching: deviceRefs(entries.map((entry) => entry.device.id)),
  });
}

function matchResult(fn: string, readings: readonly Reading[], matches: JsonValue): ReadResult {
  const matched = readings.filter(({ value }) => value !== undefined && jsonEquals(value, matches));
  const results: Readonly<Record<string, JsonValue>> = {
    any: matched.length > 0,
    all: readings.length > 0 && matched.length === readings.length,
    none: matched.length === 0,
    count: matched.length,
  };
  return outputsOf({
    value: results[fn],
    count: matched.length,
    matching: deviceRefs(matched.map(({ device }) => device.id)),
  });
}

function latestResult(
  deps: WorldReadDeps,
  control: string,
  readings: readonly Reading[],
): ReadResult {
  const changed = readings.flatMap(({ device, value }) => {
    const change = lastChange(deps, device.id, control, value);
    return value === undefined || change === undefined
      ? []
      : [{ device, value, at: change.changedAt }];
  });
  const latest = changed.sort((left, right) => right.at.localeCompare(left.at))[0];
  return outputsOf({
    value: latest === undefined ? null : latest.value,
    count: latest === undefined ? 0 : 1,
    matching: deviceRefs(latest === undefined ? [] : [latest.device.id]),
  });
}

function matchesOf(fn: string, matches: JsonValue | undefined): JsonValue {
  if (matches === undefined) {
    throw new ReadFailure('Invalid', `${fn} needs the value that counts as a match`);
  }
  return matches;
}

export function aggregateHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'device.aggregate': (inputs): ReadResult => {
      const request = parseInputs('device.aggregate', AGGREGATE, inputs);
      const key = controlKey(request.control);
      const readings = controlReadings(deps, devicesOf(deps.store, request.target), key);
      switch (request.fn) {
        case 'latest':
          return latestResult(deps, request.control, readings);
        case 'average':
        case 'min':
        case 'max':
        case 'sum':
          return numericResult(request.fn, readings);
        case 'any':
        case 'all':
        case 'none':
        case 'count':
          return matchResult(request.fn, readings, matchesOf(request.fn, request.matches));
      }
    },
  };
}
