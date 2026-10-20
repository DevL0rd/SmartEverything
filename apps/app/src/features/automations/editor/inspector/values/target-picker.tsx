import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import type { JsonValue } from '@smarteverything/domain';
import { DEVICE_FAMILIES, humanizeEnum } from '@smarteverything/domain';
import { Checkbox } from '../../../../../components/checkbox';
import { Segmented } from '../../../../../components/segmented';
import { Select } from '../../../../../components/select';
import { Text } from '../../../../../components/text';
import { ReferencePicker } from './reference-picker';
import { useValueServices } from './value-services';
import { emptyForm, isComplete, targetFormOf, targetValue, type TargetForm } from './target-model';

const FORMS = [
  { value: 'device', label: 'One device' },
  { value: 'devices', label: 'Devices' },
  { value: 'room', label: 'A room' },
  { value: 'group', label: 'A group' },
] as const;

export interface TargetPickerProps {
  readonly label: string;
  readonly value: JsonValue | undefined;
  readonly disabled: boolean;
  readonly onChange: (value: JsonValue) => void;
}

function DeviceChecklist({
  ids,
  disabled,
  onChange,
}: {
  readonly ids: readonly string[];
  readonly disabled: boolean;
  readonly onChange: (ids: readonly string[]) => void;
}): ReactNode {
  const { references } = useValueServices();
  return (
    <View className="gap-2">
      {references.options('device').map((device) => (
        <Checkbox
          key={device.id}
          label={device.label}
          checked={ids.includes(device.id)}
          disabled={disabled}
          onChange={(checked) => {
            onChange(checked ? [...ids, device.id] : ids.filter((id) => id !== device.id));
          }}
        />
      ))}
      {ids.length === 0 ? (
        <Text variant="callout" tone="critical">
          Pick at least one device.
        </Text>
      ) : null}
    </View>
  );
}

function RoomFamilies({
  form,
  disabled,
  onChange,
}: {
  readonly form: Extract<TargetForm, { t: 'room' }>;
  readonly disabled: boolean;
  readonly onChange: (families: readonly string[]) => void;
}): ReactNode {
  return (
    <View className="gap-2">
      {form.families.map((family) => (
        <Checkbox
          key={family}
          label={humanizeEnum(family)}
          checked
          disabled={disabled}
          onChange={() => {
            onChange(form.families.filter((entry) => entry !== family));
          }}
        />
      ))}
      <Select
        label="Only these kinds of device"
        searchable
        disabled={disabled}
        value={null}
        placeholder="All devices in the room"
        options={DEVICE_FAMILIES.filter((family) => !form.families.includes(family)).map(
          (family) => ({ value: family, label: humanizeEnum(family) }),
        )}
        onChange={(family) => {
          onChange([...form.families, family]);
        }}
      />
    </View>
  );
}

function FormBody({
  form,
  disabled,
  onChange,
}: {
  readonly form: TargetForm;
  readonly disabled: boolean;
  readonly onChange: (form: TargetForm) => void;
}): ReactNode {
  if (form.t === 'devices') {
    return (
      <DeviceChecklist
        ids={form.ids}
        disabled={disabled}
        onChange={(ids) => {
          onChange({ t: 'devices', ids });
        }}
      />
    );
  }
  return (
    <>
      <ReferencePicker
        of={form.t}
        capabilities={[]}
        label={FORMS.find((entry) => entry.value === form.t)?.label ?? 'Target'}
        value={form.id}
        disabled={disabled}
        onChange={(id) => {
          onChange({ ...form, id });
        }}
      />
      {form.t === 'room' ? (
        <RoomFamilies
          form={form}
          disabled={disabled}
          onChange={(families) => {
            onChange({ ...form, families });
          }}
        />
      ) : null}
    </>
  );
}

export function TargetPicker({ label, value, disabled, onChange }: TargetPickerProps): ReactNode {
  const held = targetFormOf(value);
  const [draft, setDraft] = useState<TargetForm | null>(null);
  const form = draft ?? held;
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
        onChange={(kind) => {
          setDraft(emptyForm(kind));
        }}
      />
      <FormBody form={form} disabled={disabled} onChange={change} />
    </View>
  );
}
