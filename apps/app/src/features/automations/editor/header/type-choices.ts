import type { FlowType, JsonValue, PortValue } from '@smarteverything/domain';
import { IDENT } from '@smarteverything/domain';

export interface TypeOption {
  readonly value: string;
  readonly label: string;
  readonly type: FlowType;
  readonly initial: JsonValue;
}

const ANYTHING: TypeOption = { value: 'any', label: 'Anything', type: { t: 'any' }, initial: null };

export const TYPE_OPTIONS: readonly TypeOption[] = [
  { value: 'text', label: 'Text', type: { t: 'text' }, initial: '' },
  { value: 'number', label: 'Number', type: { t: 'number' }, initial: 0 },
  { value: 'boolean', label: 'Yes or no', type: { t: 'boolean' }, initial: false },
  { value: 'duration', label: 'Duration', type: { t: 'duration' }, initial: 0 },
  { value: 'list', label: 'List', type: { t: 'list', of: { t: 'any' } }, initial: [] },
  { value: 'device', label: 'Device', type: { t: 'ref', of: 'device' }, initial: null },
  { value: 'room', label: 'Room', type: { t: 'ref', of: 'room' }, initial: null },
  ANYTHING,
];

export function typeValueOf(type: FlowType): string {
  const found = TYPE_OPTIONS.find((option) => {
    if (option.type.t !== type.t) return false;
    return option.type.t !== 'ref' || (type.t === 'ref' && option.type.of === type.of);
  });
  return found?.value ?? 'any';
}

export function optionOf(value: string): TypeOption {
  return TYPE_OPTIONS.find((option) => option.value === value) ?? ANYTHING;
}

export function initialFor(type: FlowType): PortValue {
  const option = TYPE_OPTIONS.find((entry) => entry.value === typeValueOf(type));
  return { lit: option?.initial ?? null };
}

export function nameProblem(taken: readonly string[], name: string): string | undefined {
  if (!IDENT.safeParse(name).success) {
    return 'Use letters and numbers, starting with a lowercase letter. Some words are reserved.';
  }
  return taken.includes(name) ? 'That name is already used.' : undefined;
}

export function freshName(prefix: string, taken: readonly string[]): string {
  let number = taken.length + 1;
  while (taken.includes(`${prefix}${String(number)}`)) number += 1;
  return `${prefix}${String(number)}`;
}
