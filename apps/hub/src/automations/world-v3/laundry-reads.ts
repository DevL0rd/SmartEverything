import {
  LaundryValueError,
  laundryPhase,
  laundryValuesOf,
  presentDevice,
  type LaundryValues,
} from '@smarteverything/domain';
import { z } from 'zod';
import type { WorldReadDeps } from './deps';
import { controlValue } from './device-reads';
import { parseInputs } from './inputs';
import { ReadFailure, outputsOf, type ReadHandlers, type ReadResult } from './read-port';
import { DEVICE_REF } from './refs';
import { deviceById } from './targets';

const MILLISECONDS_PER_MINUTE = 60_000;

const LAUNDRY_READ = z.object({ machine: DEVICE_REF });

const REMAINING_MINUTES = z.number().nonnegative();

function remainingOf(values: LaundryValues): number | undefined {
  const minutes = values.remaining_minutes;
  if (minutes === undefined) return undefined;
  const checked = REMAINING_MINUTES.safeParse(minutes);
  if (!checked.success)
    throw new LaundryValueError('remaining_minutes', 'a non-negative number', minutes);
  return checked.data * MILLISECONDS_PER_MINUTE;
}

function doorOpenOf(values: LaundryValues): boolean | undefined {
  const door = values.door_state;
  return door === undefined ? undefined : door === 'Open';
}

function laundryRead(deps: WorldReadDeps, machine: string): ReadResult {
  const device = deviceById(deps.store, machine);
  const presentation = presentDevice(device);
  if (presentation.family !== 'laundry')
    throw new ReadFailure('Invalid', `${device.name} is not a washing machine or dryer`);
  const values = laundryValuesOf(
    presentation.capabilities.map(({ key, role }) => ({ key, role })),
    (key) => controlValue(deps, device, key),
  );
  try {
    return outputsOf({
      status: values.laundry_status,
      phase: laundryPhase(values) ?? undefined,
      remaining: remainingOf(values),
      doorOpen: doorOpenOf(values),
    });
  } catch (cause) {
    if (cause instanceof LaundryValueError) throw new ReadFailure('Failed', cause.message);
    throw cause;
  }
}

export function laundryReadHandlers(deps: WorldReadDeps): ReadHandlers {
  return {
    'laundry.read': (inputs): ReadResult => {
      const { machine } = parseInputs('laundry.read', LAUNDRY_READ, inputs);
      return laundryRead(deps, machine);
    },
  };
}
