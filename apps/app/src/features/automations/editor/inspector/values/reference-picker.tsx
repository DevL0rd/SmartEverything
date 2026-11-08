import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { deviceFamily, type JsonValue } from '@smarteverything/domain';
import { Text } from '../../../../../components/text';
import { useDevices } from '../../../../../store/selectors';
import { OptionPicker } from './option-picker';
import { heldOf, inFamilies, withHeld, type PickerOption } from './option-picker-model';
import type { ReferenceOption } from './value-services';
import { useValueServices } from './value-services';

export const CAPABLE_ONLY = 'Only things that can do what this step needs are listed.';
export const NONE_CAPABLE = 'Nothing in this home can do what this step needs yet.';

const KIND_ICONS: Readonly<Record<string, string>> = {
  device: 'plug',
  room: 'house',
  group: 'layers',
  scene: 'sparkles',
  person: 'user',
  computer: 'monitor',
  phone: 'smartphone',
  camera: 'camera',
  chat: 'messageCircle',
  value: 'gauge',
  variable: 'box',
  automation: 'automations',
  function: 'puzzle',
  plugin_entity: 'puzzle',
};

export interface ReferencePickerProps {
  readonly of: string;
  readonly capabilities: readonly string[];
  readonly families?: readonly string[];
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
  readonly showLabel?: boolean;
}

export function referenceOptionsOf(
  options: readonly ReferenceOption[],
  current: JsonValue | undefined,
): readonly { readonly value: string; readonly label: string }[] {
  const known = options.map((option) => ({ value: option.id, label: option.label }));
  if (typeof current !== 'string' || options.some((option) => option.id === current)) return known;
  return [...known, { value: current, label: 'Removed' }];
}

export function kindIconOf(of: string): string | undefined {
  return KIND_ICONS[of];
}

export function pickerOptionsOf(
  of: string,
  options: readonly ReferenceOption[],
): readonly PickerOption[] {
  const icon = KIND_ICONS[of];
  return options.map((option) => ({
    id: option.id,
    label: option.label,
    ...(option.description === undefined ? {} : { detail: option.description }),
    ...(icon === undefined ? {} : { icon }),
  }));
}

export function useFamilyOf(): (id: string) => string | undefined {
  const devices = useDevices({ includeHidden: true });
  return useMemo(() => {
    const families = new Map(devices.map((device) => [device.id, deviceFamily(device)] as const));
    return (id: string) => families.get(id);
  }, [devices]);
}

interface FilterNote {
  readonly reason: string | null;
  readonly note: boolean;
}

export function filterNoteOf(
  filtered: boolean,
  listed: readonly PickerOption[],
  held: readonly string[],
): FilterNote {
  if (!filtered) return { reason: null, note: false };
  if (listed.length > 0) return { reason: null, note: true };
  return { reason: held.length === 0 ? NONE_CAPABLE : null, note: false };
}

export function ReferencePicker({
  of,
  capabilities,
  families = [],
  label,
  value,
  disabled,
  onChange,
  showLabel = true,
}: ReferencePickerProps): ReactNode {
  const { references } = useValueServices();
  const familyOf = useFamilyOf();
  const listed = inFamilies(
    pickerOptionsOf(of, references.options(of, capabilities)),
    families,
    familyOf,
  );
  const held = heldOf(value);
  const shown = filterNoteOf(capabilities.length > 0 || families.length > 0, listed, held);
  return (
    <>
      <OptionPicker
        label={label}
        showLabel={showLabel}
        disabled={disabled}
        multiple={false}
        value={held[0] ?? null}
        options={withHeld(listed, held)}
        reason={shown.reason}
        onPick={onChange}
      />
      {shown.note ? (
        <Text variant="footnote" tone="variant">
          {CAPABLE_ONLY}
        </Text>
      ) : null}
    </>
  );
}
