import {
  DEFAULT_DESKTOP_DRIVE_TUNING,
  DESKTOP_DRIVE_FOLLOW_MAX_BACKGROUND,
  DESKTOP_DRIVE_TUNING_REMOUNT_FIELDS,
  DESKTOP_DRIVE_TUNING_WINDOWS_FIELDS,
  DESKTOP_DRIVE_UNTIL_CHANGED,
  MAX_BACKGROUND_WIRE_LIMIT,
  type DesktopDriveTuning,
  type DesktopDriveTuningLimits,
  type DesktopDriveTuningState,
} from '@smarteverything/domain';
import { MAX_PAYLOAD_BYTES } from '@smarteverything/domain/drive-mount';
import { bytes, count } from '../../../format/number';
import { durationText } from './cache-model';

export type TuningField = keyof DesktopDriveTuning;

export type TuningKind = 'count' | 'bytes' | 'seconds' | 'switch' | 'readdir' | 'keep' | 'follow';

export type TuningValue = DesktopDriveTuning[TuningField];

export interface TuningProblem {
  readonly field: TuningField;
  readonly message: string;
}

const WHOLE = /^\d+$/;
const SIZE = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/;
const TIME = /^(\d+(?:\.\d+)?)\s*([a-z]*)$/;

const SIZE_UNITS: Readonly<Record<string, number>> = {
  '': 1,
  b: 1,
  k: 1024,
  kb: 1024,
  kib: 1024,
  m: 1024 ** 2,
  mb: 1024 ** 2,
  mib: 1024 ** 2,
  g: 1024 ** 3,
  gb: 1024 ** 3,
  gib: 1024 ** 3,
};

const TIME_UNITS: Readonly<Record<string, number>> = {
  '': 1,
  s: 1,
  sec: 1,
  second: 1,
  seconds: 1,
  m: 60,
  min: 60,
  minute: 60,
  minutes: 60,
  h: 3600,
  hour: 3600,
  hours: 3600,
  d: 86_400,
  day: 86_400,
  days: 86_400,
};

const READDIR_TEXT = { off: 'Off', auto: 'Auto', always: 'Always' };

export const UNTIL_CHANGED_TEXT = 'Until changed';

export const SIZE_HELPER = 'A size like 128K, 1M or 16MB. A plain number is bytes.';

export const TIME_HELPER = 'Seconds, or add m, h or d, like 30, 90s, 5m or 1h.';

export class TuningEntryError extends Error {
  override readonly name = 'TuningEntryError';
}

export function sizeOf(text: string): number | null {
  const match = SIZE.exec(text.trim().toLowerCase());
  if (match === null) return null;
  const [, amount = '', unit = ''] = match;
  const scale = SIZE_UNITS[unit];
  if (scale === undefined) return null;
  const value = Number(amount) * scale;
  return Number.isSafeInteger(value) ? value : null;
}

export function secondsOf(text: string): number | null {
  const match = TIME.exec(text.trim().toLowerCase());
  if (match === null) return null;
  const [, amount = '', unit = ''] = match;
  const scale = TIME_UNITS[unit];
  if (scale === undefined) return null;
  const value = Number(amount) * scale;
  return Number.isSafeInteger(value) ? value : null;
}

export function wholeOf(text: string): number | null {
  const trimmed = text.trim();
  if (!WHOLE.test(trimmed)) return null;
  const value = Number(trimmed);
  return Number.isSafeInteger(value) ? value : null;
}

export function congestionOf(tuning: DesktopDriveTuning): number {
  return tuning.congestionThreshold === DESKTOP_DRIVE_FOLLOW_MAX_BACKGROUND
    ? Math.floor((tuning.maxBackground * 3) / 4)
    : tuning.congestionThreshold;
}

export function secondsText(seconds: number, zero: string): string {
  return seconds === 0 ? zero : durationText(seconds);
}

const WORDS: ReadonlyMap<string, string> = new Map([
  ...Object.entries(READDIR_TEXT),
  [DESKTOP_DRIVE_UNTIL_CHANGED, UNTIL_CHANGED_TEXT],
  [DESKTOP_DRIVE_FOLLOW_MAX_BACKGROUND, '¾ of requests'],
]);

function wordOf(value: string): string {
  const word = WORDS.get(value);
  if (word === undefined) throw new TuningEntryError(`${value} is not a known setting value.`);
  return word;
}

function numberTextOf(kind: TuningKind, value: number, zero: string): string {
  if (kind === 'bytes') return value === 0 ? zero : bytes(value);
  if (kind === 'seconds' || kind === 'keep') return secondsText(value, zero);
  return count(value);
}

export function valueTextOf(kind: TuningKind, value: TuningValue, zero: string): string {
  if (typeof value === 'boolean') return value ? 'On' : 'Off';
  if (typeof value === 'string') return wordOf(value);
  return numberTextOf(kind, value, zero);
}

export function initialTextOf(kind: TuningKind, value: TuningValue): string {
  if (value === DESKTOP_DRIVE_UNTIL_CHANGED || value === DESKTOP_DRIVE_FOLLOW_MAX_BACKGROUND) {
    return '';
  }
  if (kind === 'bytes') return sizeInitialOf(Number(value));
  if (kind === 'seconds' || kind === 'keep') return `${String(value)}s`;
  return String(value);
}

function sizeInitialOf(value: number): string {
  if (value !== 0 && value % 1024 ** 2 === 0) return `${String(value / 1024 ** 2)}M`;
  if (value !== 0 && value % 1024 === 0) return `${String(value / 1024)}K`;
  return String(value);
}

function parsedOf(kind: TuningKind, text: string): TuningValue | null {
  const trimmed = text.trim();
  switch (kind) {
    case 'count':
      return wholeOf(trimmed);
    case 'bytes':
      return sizeOf(trimmed);
    case 'seconds':
      return secondsOf(trimmed);
    case 'keep':
      return trimmed === '' ? DESKTOP_DRIVE_UNTIL_CHANGED : secondsOf(trimmed);
    case 'follow':
      return trimmed === '' ? DESKTOP_DRIVE_FOLLOW_MAX_BACKGROUND : wholeOf(trimmed);
    case 'switch':
    case 'readdir':
      return null;
  }
}

export const ENTRY_PROBLEM: Readonly<Record<TuningKind, string>> = {
  count: 'Use a whole number',
  bytes: 'Use a size like 128K, 1M or 16MB',
  seconds: 'Use a time like 30, 90s or 5m',
  keep: 'Use a time like 30, 90s or 5m, or leave it empty',
  follow: 'Use a whole number, or leave it empty',
  switch: 'Use on or off',
  readdir: 'Use off, auto or always',
};

export function entryOf(kind: TuningKind, text: string): TuningValue {
  const value = parsedOf(kind, text);
  if (value === null) throw new TuningEntryError(`${text} is not a valid value.`);
  return value;
}

export function entryProblemOf(kind: TuningKind, text: string): string | null {
  return parsedOf(kind, text) === null ? ENTRY_PROBLEM[kind] : null;
}

export function tuningWith(
  tuning: DesktopDriveTuning,
  field: TuningField,
  value: TuningValue,
): DesktopDriveTuning {
  return { ...tuning, [field]: value };
}

export function tuningReset(tuning: DesktopDriveTuning, field: TuningField): DesktopDriveTuning {
  return tuningWith(tuning, field, DEFAULT_DESKTOP_DRIVE_TUNING[field]);
}

export function tuningIsDefault(tuning: DesktopDriveTuning, field: TuningField): boolean {
  return tuning[field] === DEFAULT_DESKTOP_DRIVE_TUNING[field];
}

export function tuningAllDefault(tuning: DesktopDriveTuning): boolean {
  const current: ReadonlyMap<string, unknown> = new Map(Object.entries(tuning));
  return Object.entries(DEFAULT_DESKTOP_DRIVE_TUNING).every(
    ([field, value]) => current.get(field) === value,
  );
}

function atLeast(
  field: TuningField,
  value: number,
  min: number,
  what: string,
): TuningProblem | null {
  return value < min ? { field, message: `Use ${what} of at least ${bytes(min)}` } : null;
}

function atMost(
  field: TuningField,
  value: number,
  max: number,
  message: string,
): TuningProblem | null {
  return value > max ? { field, message } : null;
}

export function backgroundCeilingOf(limits: DesktopDriveTuningLimits | null): number {
  const user = limits?.maxUserBackground ?? null;
  return user === null ? MAX_BACKGROUND_WIRE_LIMIT : Math.min(MAX_BACKGROUND_WIRE_LIMIT, user);
}

function backgroundProblem(
  tuning: DesktopDriveTuning,
  limits: DesktopDriveTuningLimits | null,
): TuningProblem | null {
  const user = limits?.maxUserBackground ?? null;
  const ceiling = backgroundCeilingOf(limits);
  if (tuning.maxBackground < 1) return { field: 'maxBackground', message: 'Use 1 or more' };
  const message =
    user !== null && user <= MAX_BACKGROUND_WIRE_LIMIT
      ? `The kernel allows up to ${count(user)} here`
      : `FUSE allows up to ${count(MAX_BACKGROUND_WIRE_LIMIT)}`;
  return atMost('maxBackground', tuning.maxBackground, ceiling, message);
}

function congestionProblem(
  tuning: DesktopDriveTuning,
  limits: DesktopDriveTuningLimits | null,
): TuningProblem | null {
  const congestion = congestionOf(tuning);
  const user = limits?.maxUserCongestionThreshold ?? null;
  if (congestion < 1) return { field: 'congestionThreshold', message: 'Use 1 or more' };
  if (user !== null && congestion > user && user < tuning.maxBackground) {
    return {
      field: 'congestionThreshold',
      message: `The kernel allows up to ${count(user)} here`,
    };
  }
  return atMost(
    'congestionThreshold',
    congestion,
    tuning.maxBackground,
    `Use at most the requests in flight, ${count(tuning.maxBackground)}`,
  );
}

function requestProblem(
  tuning: DesktopDriveTuning,
  limits: DesktopDriveTuningLimits | null,
): TuningProblem | null {
  const max = limits?.maxRequestBytes ?? MAX_PAYLOAD_BYTES;
  const page = limits?.pageBytes ?? null;
  return (
    atMost(
      'maxRequestBytes',
      tuning.maxRequestBytes,
      max,
      `The kernel allows up to ${bytes(max)} here`,
    ) ?? (page === null ? null : atLeast('maxRequestBytes', tuning.maxRequestBytes, page, 'a size'))
  );
}

function readaheadProblem(
  tuning: DesktopDriveTuning,
  limits: DesktopDriveTuningLimits | null,
): TuningProblem | null {
  const page = limits?.pageBytes ?? null;
  const offer = limits?.kernelReadaheadOfferBytes ?? null;
  const value = tuning.kernelReadaheadBytes;
  return (
    (offer === null
      ? null
      : atMost(
          'kernelReadaheadBytes',
          value,
          offer,
          `The kernel offers up to ${bytes(offer)} here`,
        )) ?? (page === null ? null : atLeast('kernelReadaheadBytes', value, page, 'a size'))
  );
}

function socketProblem(tuning: DesktopDriveTuning): TuningProblem | null {
  if (tuning.pingSeconds < 1) return { field: 'pingSeconds', message: 'Use 1 second or more' };
  if (tuning.deadAfterSeconds <= tuning.pingSeconds) {
    return {
      field: 'deadAfterSeconds',
      message: `Use more than the check interval, ${durationText(tuning.pingSeconds)}`,
    };
  }
  return atMost(
    'bulkFrameBytes',
    tuning.bulkFrameBytes,
    MAX_PAYLOAD_BYTES,
    `The connection carries up to ${bytes(MAX_PAYLOAD_BYTES)} a piece`,
  );
}

function positiveProblem(tuning: DesktopDriveTuning): TuningProblem | null {
  if (tuning.uploadFiles < 1) return { field: 'uploadFiles', message: 'Use 1 or more' };
  if (tuning.uploadFramesInFlight < 1)
    return { field: 'uploadFramesInFlight', message: 'Use 1 or more' };
  if (tuning.bulkFrameBytes < 1) return { field: 'bulkFrameBytes', message: 'Use 1 byte or more' };
  return null;
}

export function tuningProblemOf(
  tuning: DesktopDriveTuning,
  limits: DesktopDriveTuningLimits | null,
): TuningProblem | null {
  return (
    backgroundProblem(tuning, limits) ??
    congestionProblem(tuning, limits) ??
    requestProblem(tuning, limits) ??
    readaheadProblem(tuning, limits) ??
    socketProblem(tuning) ??
    positiveProblem(tuning)
  );
}

export function fieldProblemOf(
  tuning: DesktopDriveTuning,
  limits: DesktopDriveTuningLimits | null,
  { field, kind }: { readonly field: TuningField; readonly kind: TuningKind },
  text: string,
): string | null {
  const value = parsedOf(kind, text);
  if (value === null) return ENTRY_PROBLEM[kind];
  return tuningProblemOf(tuningWith(tuning, field, value), limits)?.message ?? null;
}

const REMOUNT: ReadonlySet<TuningField> = new Set(DESKTOP_DRIVE_TUNING_REMOUNT_FIELDS);
const WINDOWS_MISSING: ReadonlySet<TuningField> = new Set(DESKTOP_DRIVE_TUNING_WINDOWS_FIELDS);

export function appliesOnRemount(field: TuningField): boolean {
  return REMOUNT.has(field);
}

export function missingOnWindows(field: TuningField): boolean {
  return WINDOWS_MISSING.has(field);
}

function effectiveOf(tuning: DesktopDriveTuning, field: TuningField): TuningValue {
  return field === 'congestionThreshold' ? congestionOf(tuning) : tuning[field];
}

export function remountPendingFor(state: DesktopDriveTuningState, field: TuningField): boolean {
  if (!appliesOnRemount(field)) return false;
  const wanted = effectiveOf(state.saved, field);
  return state.applied.some((mount) => effectiveOf(mount.tuning, field) !== wanted);
}

export function remountPending(state: DesktopDriveTuningState): boolean {
  return DESKTOP_DRIVE_TUNING_REMOUNT_FIELDS.some((field) => remountPendingFor(state, field));
}

export interface InFlightGauge {
  readonly max: number;
  readonly congestion: number;
  readonly ceiling: number;
}

export function inFlightGaugeOf(
  tuning: DesktopDriveTuning,
  limits: DesktopDriveTuningLimits | null,
): InFlightGauge {
  const max = tuning.maxBackground;
  const congestion = Math.min(congestionOf(tuning), max);
  return { max, congestion, ceiling: backgroundCeilingOf(limits) };
}
