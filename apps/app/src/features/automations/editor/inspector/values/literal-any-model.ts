import type { JsonValue } from '@smarteverything/domain';

export type AnyKind = 'text' | 'number' | 'flag' | 'place' | 'list' | 'group';

export const ANY_KINDS: readonly { readonly value: AnyKind; readonly label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'flag', label: 'On or off' },
  { value: 'place', label: 'Device, room or group' },
  { value: 'list', label: 'List' },
  { value: 'group', label: 'Several named values' },
];

function isList(value: JsonValue): value is readonly JsonValue[] {
  return Array.isArray(value);
}

const TARGET_KEYS: ReadonlySet<string> = new Set(['device', 'devices', 'room', 'group']);

function isTarget(value: Readonly<Record<string, JsonValue>>): boolean {
  const keys = Object.keys(value);
  return keys.length > 0 && keys.every((key) => TARGET_KEYS.has(key) || key === 'families');
}

export function anyKindOf(value: JsonValue | undefined): AnyKind {
  if (typeof value === 'number') return 'number';
  if (typeof value === 'boolean') return 'flag';
  if (value === null || value === undefined || typeof value === 'string') return 'text';
  if (isList(value)) return 'list';
  return isTarget(value) ? 'place' : 'group';
}

export function anyStart(kind: AnyKind): JsonValue {
  switch (kind) {
    case 'text':
      return '';
    case 'number':
      return 0;
    case 'flag':
      return false;
    case 'place':
      return { device: '' };
    case 'list':
      return [];
    case 'group':
      return {};
  }
}

const ID_SUFFIX = 'Id';

export function refOfKey(name: string): string | undefined {
  if (!name.endsWith(ID_SUFFIX) || name.length === ID_SUFFIX.length) return undefined;
  return name.slice(0, -ID_SUFFIX.length);
}

export function entryName(taken: readonly string[]): string {
  const used = new Set(taken);
  let count = 1;
  while (used.has(`value${String(count)}`)) count += 1;
  return `value${String(count)}`;
}

export function entryNameProblem(
  held: Readonly<Record<string, JsonValue>>,
  name: string,
  wanted: string,
): string | undefined {
  if (wanted === '') return 'Give it a name.';
  return wanted !== name && Object.hasOwn(held, wanted)
    ? 'Another value already has this name.'
    : undefined;
}
