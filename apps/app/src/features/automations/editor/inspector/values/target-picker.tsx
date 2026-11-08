import type { ReactNode } from 'react';
import { use, useState } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { DEVICE_FAMILIES, humanizeEnum } from '@smarteverything/domain';
import { Segmented } from '../../../../../components/segmented';
import { Text } from '../../../../../components/text';
import { PortScopeContext } from './literal-model';
import { OptionPicker } from './option-picker';
import { withHeld, type PickerOption } from './option-picker-model';
import { CAPABLE_ONLY, pickerOptionsOf } from './reference-picker';
import { useValueServices, type ValueServices } from './value-services';
import {
  chosenControlOf,
  devicesForControl,
  emptyForm,
  isComplete,
  reachableOf,
  targetFormOf,
  targetValue,
  type TargetForm,
} from './target-model';

const FORMS = [
  { value: 'device', label: 'Device', spoken: 'One device' },
  { value: 'devices', label: 'Several', spoken: 'Several devices' },
  { value: 'room', label: 'Room', spoken: 'A room' },
  { value: 'group', label: 'Group', spoken: 'A group' },
] as const;

const FAMILY_OPTIONS: readonly PickerOption[] = DEVICE_FAMILIES.map((family) => ({
  id: family,
  label: humanizeEnum(family),
}));

export interface TargetPickerProps {
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly capabilities?: readonly string[];
  readonly onChange: (value: JsonValue) => void;
}

interface Choices {
  readonly filtered: (form: TargetForm) => boolean;
  readonly of: (
    kind: 'device' | 'room' | 'group',
    held: readonly string[],
  ) => readonly PickerOption[];
}

function useChoices(capabilities: readonly string[]): Choices {
  const { references, deviceOptions }: ValueServices = useValueServices();
  const control = chosenControlOf(use(PortScopeContext));
  const capable = capabilities.length > 0;
  const reach = capable
    ? new Set(references.options('target', capabilities).map((row) => row.id))
    : null;
  const has =
    control === null
      ? null
      : (id: string): boolean => {
          const found = deviceOptions(control.source, { target: [id], wholeHome: false });
          return found.status === 'ready' && found.options.some((row) => row.id === control.id);
        };
  return {
    filtered: (form) =>
      capable || (control !== null && (form.t === 'device' || form.t === 'devices')),
    of: (kind, held): readonly PickerOption[] => {
      const listed = pickerOptionsOf(kind, references.options(kind));
      const reached = reachableOf(listed, reach);
      const shown = kind === 'device' ? devicesForControl(reached, held, has) : reached;
      return withHeld(shown, held);
    },
  };
}

function FormBody({
  form,
  label,
  choices,
  disabled,
  onChange,
}: {
  readonly form: TargetForm;
  readonly label: string;
  readonly choices: Choices;
  readonly disabled: boolean;
  readonly onChange: (form: TargetForm) => void;
}): ReactNode {
  if (form.t === 'devices') {
    return (
      <OptionPicker
        label="Devices"
        multiple
        held={form.ids}
        options={choices.of('device', form.ids)}
        placeholder="Pick devices"
        disabled={disabled}
        onChange={(ids) => {
          onChange({ t: 'devices', ids });
        }}
      />
    );
  }
  const held = form.id === '' ? [] : [form.id];
  return (
    <OptionPicker
      label={FORMS.find((entry) => entry.value === form.t)?.spoken ?? label}
      multiple={false}
      value={form.id === '' ? null : form.id}
      options={choices.of(form.t, held)}
      disabled={disabled}
      onPick={(id) => {
        onChange({ ...form, id });
      }}
    />
  );
}

function RoomFamilies({
  form,
  disabled,
  onChange,
}: {
  readonly form: TargetForm;
  readonly disabled: boolean;
  readonly onChange: (form: TargetForm) => void;
}): ReactNode {
  if (form.t !== 'room') return null;
  return (
    <OptionPicker
      label="Only these kinds of device"
      multiple
      held={form.families}
      options={FAMILY_OPTIONS}
      placeholder="All devices in the room"
      disabled={disabled}
      onChange={(families) => {
        onChange({ ...form, families });
      }}
    />
  );
}

function Problem({ form }: { readonly form: TargetForm }): ReactNode {
  if (form.t !== 'devices' || form.ids.length > 0) return null;
  return (
    <Text variant="callout" tone="critical">
      Pick at least one device.
    </Text>
  );
}

export function TargetPicker({
  label,
  value,
  disabled,
  capabilities = [],
  onChange,
}: TargetPickerProps): ReactNode {
  const [draft, setDraft] = useState<TargetForm | null>(null);
  const form = draft ?? targetFormOf(value);
  const choices = useChoices(capabilities);
  const change = (next: TargetForm): void => {
    if (isComplete(next)) {
      setDraft(null);
      onChange(targetValue(next));
    } else {
      setDraft(next);
    }
  };
  return (
    <View className="gap-3">
      <Segmented
        label={`${label} kind`}
        options={FORMS}
        value={form.t}
        disabled={disabled}
        compact
        onChange={(kind) => {
          setDraft(emptyForm(kind));
        }}
      />
      <FormBody form={form} label={label} choices={choices} disabled={disabled} onChange={change} />
      <RoomFamilies form={form} disabled={disabled} onChange={change} />
      <Problem form={form} />
      {choices.filtered(form) ? (
        <Text variant="footnote" tone="variant">
          {CAPABLE_ONLY}
        </Text>
      ) : null}
    </View>
  );
}
