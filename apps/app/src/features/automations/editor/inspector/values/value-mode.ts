import type { PortValue } from '@smarteverything/domain';

export type ValueMode = 'value' | 'wire';

export const MODE_LABELS: Readonly<Record<ValueMode, string>> = {
  value: 'Value',
  wire: 'Wire',
};

export function modeOf(value: PortValue | undefined): ValueMode {
  return value !== undefined && 'wire' in value ? 'wire' : 'value';
}

export function modesFor(isStatic: boolean): readonly ValueMode[] {
  return isStatic ? ['value'] : ['value', 'wire'];
}

export function switchedValue(
  value: PortValue | undefined,
  to: ValueMode,
): PortValue | null | undefined {
  if (modeOf(value) === to) return value;
  return to === 'value' ? null : undefined;
}
