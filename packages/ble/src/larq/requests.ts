import type { BottleLog } from '@smarteverything/domain';
import { LarqFrameError } from './errors';
import { QUIET_CODES, REMINDER_WRITE_CODES, UV_CODES, type UvCommand } from './enums';
import { encodeRequest } from './envelope';
import type { READ_REQUESTS } from './names';
import { concatBytes, encodeFixed32, encodeFloat, encodeMessage, encodeVarint } from './wire';

export type ReadRequestName = (typeof READ_REQUESTS)[number];

export const LOG_REQUESTS = {
  tof: 'RequestGetCapTofLog',
  activation: 'RequestGetCapActivationLog',
  state: 'RequestGetCapStateLog',
  fault: 'RequestGetCapFaultLog',
  activation_adc: 'RequestGetActivationCapAdcLog',
  charging_adc: 'RequestGetChargingCapAdcLog',
} as const satisfies Record<BottleLog, ReadRequestName>;

export const SECONDS_PER_DAY = 86_400;

export interface ReminderColour {
  readonly red: number;
  readonly green: number;
  readonly blue: number;
}

export interface ReminderWrite {
  readonly state: 'off' | 'interval_fixed';
  readonly startSeconds: number;
  readonly stopSeconds: number;
  readonly intervalSeconds: number;
  readonly colour: ReminderColour;
}

export interface QuietWrite {
  readonly state: keyof typeof QUIET_CODES;
  readonly startSeconds: number;
  readonly stopSeconds: number;
  readonly snoozeMinutes: number;
}

function inRange(name: string, value: number, least: number, most: number): number {
  if (!Number.isInteger(value) || value < least || value > most) {
    throw new LarqFrameError(
      `${name} must be a whole number from ${String(least)} to ${String(most)}, not ${String(value)}.`,
    );
  }
  return value;
}

function unit(name: string, value: number): number {
  if (!(value >= 0 && value <= 1)) {
    throw new LarqFrameError(`${name} must be from 0 to 1, not ${String(value)}.`);
  }
  return value;
}

export function readRequest(requestId: number, name: ReadRequestName): Uint8Array {
  return encodeRequest(requestId, name);
}

export function setTimeRequest(requestId: number, epochMilliseconds: number): Uint8Array {
  return encodeRequest(
    requestId,
    'RequestSetCapTimeSettings',
    encodeMessage(
      1,
      encodeVarint(1, inRange('The time', epochMilliseconds, 1, Number.MAX_SAFE_INTEGER)),
    ),
  );
}

export function logRequest(
  requestId: number,
  log: BottleLog,
  fromTimestamp: number,
  limit: number,
): Uint8Array {
  const query = concatBytes(
    encodeVarint(1, inRange('The log cursor', fromTimestamp, 0, Number.MAX_SAFE_INTEGER)),
    encodeFixed32(2, inRange('The page size', limit, 1, 10)),
  );
  return encodeRequest(requestId, LOG_REQUESTS[log], encodeMessage(1, query));
}

export function setReminderRequest(requestId: number, write: ReminderWrite): Uint8Array {
  const colour = concatBytes(
    encodeFloat(1, unit('The red part', write.colour.red)),
    encodeFloat(2, unit('The green part', write.colour.green)),
    encodeFloat(3, unit('The blue part', write.colour.blue)),
    encodeFloat(4, 1),
  );
  const settings = concatBytes(
    encodeVarint(1, REMINDER_WRITE_CODES[write.state]),
    encodeFixed32(2, inRange('The reminder start', write.startSeconds, 1, SECONDS_PER_DAY)),
    encodeFixed32(3, inRange('The reminder stop', write.stopSeconds, 1, SECONDS_PER_DAY)),
    encodeFixed32(4, inRange('The reminder interval', write.intervalSeconds, 0, SECONDS_PER_DAY)),
    encodeMessage(5, colour),
  );
  return encodeRequest(requestId, 'RequestSetCapHydroReminderSettings', encodeMessage(1, settings));
}

export function setQuietRequest(requestId: number, write: QuietWrite): Uint8Array {
  const settings = concatBytes(
    encodeVarint(1, QUIET_CODES[write.state]),
    encodeFixed32(2, inRange('The quiet start', write.startSeconds, 1, SECONDS_PER_DAY)),
    encodeFixed32(3, inRange('The quiet stop', write.stopSeconds, 1, SECONDS_PER_DAY)),
    encodeFixed32(4, inRange('The snooze', write.snoozeMinutes, 0, SECONDS_PER_DAY)),
  );
  return encodeRequest(requestId, 'RequestSetCapDoNotDisturbSettings', encodeMessage(1, settings));
}

export function uvRequest(requestId: number, mode: UvCommand): Uint8Array {
  return encodeRequest(requestId, 'RequestSetCapUvActivate', encodeVarint(1, UV_CODES[mode]));
}
