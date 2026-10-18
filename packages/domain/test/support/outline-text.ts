import type { JsonValue } from '../../src/values';

export type Outline = JsonValue;

export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

export const INPUT_TYPE_OF = {
  boolean: 'flag',
  number: 'number',
  duration: 'duration',
  choice: 'choice',
  string: 'text',
} as const;

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function stable(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (isRecord(value))
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stable(entry)}`)
      .join(',')}}`;
  return JSON.stringify(value);
}

export function sortedDays(days: readonly number[]): string {
  return [...days].sort((left, right) => left - right).join(',');
}

export function fieldsText(fields: Readonly<Record<string, string>>): string {
  return `fields{${Object.entries(fields)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, entry]) => `${key}=${entry}`)
    .join(',')}}`;
}

export function changeText(
  add: number | undefined,
  min: number | undefined,
  max: number | undefined,
): string {
  return [
    add === undefined ? '' : ` add ${String(add)}`,
    min === undefined ? '' : ` min ${String(min)}`,
    max === undefined ? '' : ` max ${String(max)}`,
  ].join('');
}

export function targetText(
  kind: 'room' | 'group' | 'devices' | 'device',
  ids: readonly string[],
  families?: readonly string[],
): string {
  return `${kind}:${ids.join(',')}${families === undefined ? '' : `:${families.join(',')}`}`;
}

export interface SetParts {
  readonly id: string | undefined;
  readonly target: string;
  readonly control: string;
  readonly to: string | null;
  readonly by: number | null;
  readonly percent: boolean;
  readonly duration: number | null;
  readonly whileText: string | null;
  readonly priority: number;
}

export function setOutline(parts: SetParts): Outline {
  return {
    step: 'set',
    id: parts.id ?? null,
    target: parts.target,
    control: parts.control,
    to: parts.to,
    by: parts.by,
    percent: parts.percent,
    for: parts.duration,
    while: parts.whileText,
    priority: parts.priority,
  };
}

export interface Watch {
  readonly source: string;
  readonly kind: string;
  readonly subject: string | null;
  readonly field: string | null;
  readonly match: string;
  readonly test: string | null;
  readonly window: string | null;
  readonly hold: number;
  readonly debounce: number;
  readonly cooldown: number;
}

export function watchOutline(
  id: string | undefined,
  watch: Partial<Watch> & Pick<Watch, 'source' | 'kind'>,
): Outline {
  return {
    watch: {
      id: id ?? null,
      subject: null,
      field: null,
      match: '{}',
      test: null,
      window: null,
      hold: 0,
      debounce: 0,
      cooldown: 0,
      ...watch,
    },
  };
}
