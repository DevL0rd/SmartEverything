import type { JsonValue } from '@smarteverything/domain';

export interface PickerOption {
  readonly id: string;
  readonly label: string;
  readonly detail?: string;
  readonly icon?: string;
  readonly unavailable?: string;
}

export const MISSING_LABEL = 'Removed';
export const MISSING_REASON = 'No longer in this home';

export function heldOf(value: JsonValue | undefined): readonly string[] {
  if (typeof value === 'string') return value === '' ? [] : [value];
  return Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item !== '')
    : [];
}

export function withHeld(
  options: readonly PickerOption[],
  held: readonly string[],
): readonly PickerOption[] {
  const known = new Set(options.map((option) => option.id));
  const missing = held.filter((id) => !known.has(id));
  return [
    ...options,
    ...missing.map((id) => ({ id, label: MISSING_LABEL, detail: id, unavailable: MISSING_REASON })),
  ];
}

export function inFamilies(
  options: readonly PickerOption[],
  families: readonly string[],
  familyOf: (id: string) => string | undefined,
): readonly PickerOption[] {
  if (families.length === 0) return options;
  return options.filter((option) => {
    const family = familyOf(option.id);
    return family !== undefined && families.includes(family);
  });
}

function haystack(option: PickerOption): string {
  return `${option.label} ${option.detail ?? ''}`.toLowerCase();
}

export function matchOptions(
  options: readonly PickerOption[],
  query: string,
): readonly PickerOption[] {
  const terms = query
    .trim()
    .toLowerCase()
    .split(/\s+/u)
    .filter((term) => term !== '');
  if (terms.length === 0) return options;
  return options.filter((option) => {
    const text = haystack(option);
    return terms.every((term) => text.includes(term));
  });
}

export function toggled(held: readonly string[], id: string): readonly string[] {
  return held.includes(id) ? held.filter((entry) => entry !== id) : [...held, id];
}

export function canPress(option: PickerOption, held: readonly string[]): boolean {
  return option.unavailable === undefined || held.includes(option.id);
}

export function summaryOf(
  options: readonly PickerOption[],
  held: readonly string[],
  placeholder: string,
): string {
  const labels = held.map((id) => options.find((option) => option.id === id)?.label ?? id);
  const [first] = labels;
  if (first === undefined) return placeholder;
  return labels.length === 1 ? first : `${first} and ${String(labels.length - 1)} more`;
}

export function spokenOf(option: PickerOption): string {
  return [option.label, option.detail, option.unavailable]
    .filter((part) => part !== undefined && part !== '')
    .join(', ');
}
