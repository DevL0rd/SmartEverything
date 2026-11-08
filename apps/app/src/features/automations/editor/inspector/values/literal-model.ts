import { createContext } from 'react';
import type { JsonValue, PortEditorId, PortValue } from '@smarteverything/domain';
import type { FieldControl } from '../schema-fields';
import { controlTypingOf, type ControlTyping } from './control-model';

export interface DeviceScope {
  readonly target: readonly string[];
  readonly wholeHome: boolean;
}

export interface PortScope extends DeviceScope {
  readonly ports: Readonly<Record<string, PortValue>>;
  readonly controls: Readonly<Record<string, FieldControl>>;
}

export const NO_PORT_SCOPE: PortScope = { ports: {}, controls: {}, target: [], wholeHome: false };

export const PortScopeContext = createContext<PortScope>(NO_PORT_SCOPE);

const FALLBACK_MIN = -Number.MAX_SAFE_INTEGER;
const FALLBACK_MAX = Number.MAX_SAFE_INTEGER;

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

export type AnnotatedControl = Extract<FieldControl, { t: 'pick' | 'editor' | 'typedBy' }>;

export type StructuredControl = Exclude<FieldControl, ScalarControl | AnnotatedControl>;

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

const ANNOTATED_TAGS: ReadonlySet<string> = new Set(['pick', 'editor', 'typedBy']);

export function isAnnotatedControl(control: FieldControl): control is AnnotatedControl {
  return ANNOTATED_TAGS.has(control.t);
}

function annotatedDefault(control: AnnotatedControl): JsonValue {
  if (control.t === 'pick') return control.multiple ? [] : null;
  return defaultLiteral(control.base);
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
    case 'entries':
      return {};
    case 'record':
      return Object.fromEntries(
        control.fields
          .filter((field) => !field.optional)
          .map((field) => [field.name, defaultLiteral(field.control)]),
      );
    case 'colour':
      return { hue: 0, saturation: 0, value: 100 };
    case 'reference':
    case 'entity':
    case 'json':
    case 'wire':
      return null;
  }
}

export function defaultLiteral(control: FieldControl): JsonValue {
  if (isAnnotatedControl(control)) return annotatedDefault(control);
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

const EDITOR_CONTROLS: Readonly<Partial<Record<PortEditorId, FieldControl>>> = {
  duration: { t: 'duration' },
  colour: { t: 'colour' },
  'time-of-day': { t: 'moment', of: 'timeOfDay' },
};

export function editorControl(control: Extract<FieldControl, { t: 'editor' }>): FieldControl {
  return EDITOR_CONTROLS[control.id] ?? control.base;
}

const OPEN_NUMBER: FieldControl = {
  t: 'number',
  integer: false,
  min: undefined,
  max: undefined,
  step: 1,
  unit: undefined,
};

function isRecordValue(value: JsonValue): value is Readonly<Record<string, JsonValue>> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isListValue(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

function isHsv(value: JsonValue): boolean {
  if (!isRecordValue(value)) return false;
  return ['hue', 'saturation', 'value'].every((key) => typeof value[key] === 'number');
}

export function sampleControl(value: JsonValue): FieldControl | null {
  if (typeof value === 'boolean') return { t: 'switch' };
  if (typeof value === 'number') return OPEN_NUMBER;
  if (typeof value === 'string') return { t: 'text' };
  if (isListValue(value)) {
    const first = value[0];
    return {
      t: 'list',
      item: (first === undefined ? null : sampleControl(first)) ?? { t: 'json' },
    };
  }
  if (value === null) return null;
  return isHsv(value) ? { t: 'colour' } : { t: 'entries', item: { t: 'json' } };
}

function isGenericControl(control: FieldControl): boolean {
  return control.t === 'json' || control.t === 'typedBy';
}

function shapedLike(base: FieldControl, sample: FieldControl): FieldControl {
  return base.t === 'list' ? { t: 'list', item: shapedLike(base.item, sample) } : sample;
}

function sampledControl(
  control: Extract<FieldControl, { t: 'typedBy' }>,
  scope: PortScope,
): FieldControl {
  const typing = scope.controls[control.port];
  const given = scope.ports[control.port];
  if (typing === undefined || !isGenericControl(typing)) return control.base;
  if (given === undefined || !('lit' in given)) return control.base;
  const sample = sampleControl(given.lit);
  return sample === null ? control.base : shapedLike(control.base, sample);
}

export type TypedEditor =
  | { readonly t: 'control'; readonly typing: ControlTyping }
  | { readonly t: 'field'; readonly control: FieldControl };

export function typedControl(
  control: Extract<FieldControl, { t: 'typedBy' }>,
  scope: PortScope,
): TypedEditor {
  const typing = controlTypingOf(control, scope);
  if (typing !== null) return { t: 'control', typing };
  return { t: 'field', control: sampledControl(control, scope) };
}
