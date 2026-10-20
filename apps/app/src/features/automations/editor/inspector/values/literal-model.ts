import type { JsonValue } from '@smarteverything/domain';
import type { FieldControl } from '../schema-fields';

const FALLBACK_MIN = -1_000_000;
const FALLBACK_MAX = 1_000_000;

export function numberBounds(control: Extract<FieldControl, { t: 'number' }>): {
  readonly min: number;
  readonly max: number;
} {
  return { min: control.min ?? FALLBACK_MIN, max: control.max ?? FALLBACK_MAX };
}

export type ScalarControl = Extract<
  FieldControl,
  { t: 'switch' | 'number' | 'text' | 'choice' | 'duration' }
>;

export type StructuredControl = Exclude<FieldControl, ScalarControl>;

const SCALAR_TAGS: ReadonlySet<string> = new Set([
  'switch',
  'number',
  'text',
  'choice',
  'duration',
]);

export function isScalarControl(control: FieldControl): control is ScalarControl {
  return SCALAR_TAGS.has(control.t);
}

function scalarDefault(control: ScalarControl): JsonValue {
  switch (control.t) {
    case 'switch':
      return false;
    case 'number':
      return clampTo(0, control);
    case 'text':
      return '';
    case 'choice':
      return control.options[0]?.id ?? '';
    case 'duration':
      return 60_000;
  }
}

function momentDefault(of: 'instant' | 'timeOfDay' | 'date'): string {
  if (of === 'timeOfDay') return '07:00';
  return of === 'date' ? todayKey() : nowIso();
}

function structuredDefault(control: StructuredControl): JsonValue {
  switch (control.t) {
    case 'moment':
      return momentDefault(control.of);
    case 'list':
      return [];
    case 'record':
      return Object.fromEntries(
        control.fields
          .filter((field) => !field.optional)
          .map((field) => [field.name, defaultLiteral(field.control)]),
      );
    case 'colour':
      return { hue: 0, saturation: 0, value: 100 };
    case 'reference':
    case 'json':
    case 'wire':
      return null;
  }
}

export function defaultLiteral(control: FieldControl): JsonValue {
  return isScalarControl(control) ? scalarDefault(control) : structuredDefault(control);
}

function clampTo(value: number, control: Extract<FieldControl, { t: 'number' }>): number {
  const { min, max } = numberBounds(control);
  return Math.min(max, Math.max(min, value));
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

export function dayKey(date: Date): string {
  return `${String(date.getFullYear())}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function todayKey(): string {
  return dayKey(new Date());
}

function nowIso(): string {
  return new Date().toISOString();
}

export function timeOfDayParts(value: JsonValue | undefined): { hour: number; minute: number } {
  const [hour = '7', minute = '0'] = typeof value === 'string' ? value.split(':') : [];
  return { hour: Number(hour), minute: Number(minute) };
}

export function timeOfDayText(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

export function dateOfKey(value: JsonValue | undefined): Date {
  const parsed = typeof value === 'string' ? new Date(`${value.slice(0, 10)}T12:00:00`) : null;
  return parsed === null || Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function instantWith(
  current: JsonValue | undefined,
  day: Date | null,
  time: string | null,
): string {
  const base = instantOf(current);
  const [hour = base.getHours(), minute = base.getMinutes()] =
    time === null ? [] : time.split(':').map(Number);
  const target = day ?? base;
  const next = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
    hour,
    minute,
    0,
    0,
  );
  return next.toISOString();
}

function instantOf(value: JsonValue | undefined): Date {
  const parsed = typeof value === 'string' ? new Date(value) : null;
  return parsed === null || Number.isNaN(parsed.getTime()) ? new Date() : parsed;
}

export function instantTimeText(value: JsonValue | undefined): string {
  const date = instantOf(value);
  return timeOfDayText(date.getHours(), date.getMinutes());
}

export function instantDay(value: JsonValue | undefined): Date {
  return instantOf(value);
}
