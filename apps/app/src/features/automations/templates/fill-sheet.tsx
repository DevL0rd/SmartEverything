import type { JsonValue } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Checkbox } from '../../../components/checkbox';
import { ListRow } from '../../../components/list-row';
import { NumberStepper } from '../../../components/number-stepper';
import { List } from '../../../components/section';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { TextField } from '../../../components/text-field';
import { TimeField } from '../../../components/time-field';
import type { Slot, SlotValues, Template } from '../model/templates/parameters';
import { clockOf, clockText } from '../model/templates/preview';

export interface FillSheetProps {
  readonly entry: Template | null;
  readonly onClose: () => void;
  readonly onCreate: (entry: Template, values: SlotValues) => void;
}

interface FieldProps {
  readonly slot: Slot;
  readonly value: JsonValue;
  readonly onChange: (value: JsonValue) => void;
}

const MIDNIGHT = { hour: 0, minute: 0 } as const;

function textOf(value: JsonValue): string {
  return typeof value === 'string' ? value : '';
}

function PickOne({ slot, value, onChange }: FieldProps): ReactNode {
  return (
    <List inset>
      {(slot.choices ?? []).map((choice) => (
        <ListRow
          key={choice.value}
          title={choice.label}
          {...(choice.value === value ? { icon: 'check' as const } : {})}
          selected={choice.value === value}
          onPress={() => {
            onChange(choice.value);
          }}
        />
      ))}
    </List>
  );
}

function PickMany({ slot, value, onChange }: FieldProps): ReactNode {
  const chosen = Array.isArray(value) ? value.map(textOf) : [];
  return (
    <View className="gap-1">
      {(slot.choices ?? []).map((choice) => (
        <Checkbox
          key={choice.value}
          label={choice.label}
          checked={chosen.includes(choice.value)}
          onChange={(checked) => {
            onChange(
              checked ? [...chosen, choice.value] : chosen.filter((item) => item !== choice.value),
            );
          }}
        />
      ))}
    </View>
  );
}

function PickTime({ slot, value, onChange }: FieldProps): ReactNode {
  return (
    <TimeField
      label={slot.label}
      value={clockOf(textOf(value)) ?? MIDNIGHT}
      onChange={(clock) => {
        onChange(clockText(clock));
      }}
    />
  );
}

function PickNumber({ slot, value, onChange }: FieldProps): ReactNode {
  return (
    <NumberStepper
      label={slot.label}
      value={typeof value === 'number' ? value : null}
      min={slot.min ?? 0}
      max={slot.max ?? 100}
      step={1}
      {...(slot.unit === undefined ? {} : { unit: slot.unit })}
      onChange={onChange}
    />
  );
}

function PickText({ slot, value, onChange }: FieldProps): ReactNode {
  return <TextField label={slot.label} value={textOf(value)} onChange={onChange} multiline />;
}

const FIELDS: Readonly<Record<Slot['kind'], (props: FieldProps) => ReactNode>> = {
  device: PickOne,
  room: PickOne,
  devices: PickMany,
  people: PickMany,
  time: PickTime,
  number: PickNumber,
  text: PickText,
};

function StepFooter({
  first,
  last,
  onBack,
  onNext,
}: {
  readonly first: boolean;
  readonly last: boolean;
  readonly onBack: () => void;
  readonly onNext: () => void;
}): ReactNode {
  return (
    <View className="flex-row gap-2">
      <Button label={first ? 'Cancel' : 'Back'} variant="text" onPress={onBack} />
      <Button label={last ? 'Create automation' : 'Next'} grow onPress={onNext} />
    </View>
  );
}

function initialValues(entry: Template): SlotValues {
  return Object.fromEntries(entry.slots.map((slot) => [slot.name, slot.value]));
}

function Steps({
  entry,
  onClose,
  onCreate,
}: {
  readonly entry: Template;
  readonly onClose: () => void;
  readonly onCreate: FillSheetProps['onCreate'];
}): ReactNode {
  const [values, setValues] = useState<SlotValues>(() => initialValues(entry));
  const [index, setIndex] = useState(0);
  const slot = entry.slots[index];
  const footer = (
    <StepFooter
      first={index === 0}
      last={index >= entry.slots.length - 1}
      onBack={() => {
        if (index === 0) onClose();
        else setIndex(index - 1);
      }}
      onNext={() => {
        if (index >= entry.slots.length - 1) onCreate(entry, values);
        else setIndex(index + 1);
      }}
    />
  );
  const Field = slot === undefined ? null : FIELDS[slot.kind];
  return (
    <Sheet open title={entry.title} onClose={onClose} footer={footer} detents={['half', 'full']}>
      <View className="gap-3">
        <Text variant="footnote" tone="variant">
          {`Step ${String(index + 1)} of ${String(entry.slots.length)}`}
        </Text>
        {slot === undefined || Field === null ? null : (
          <>
            <Text variant="title-3">{slot.label}</Text>
            <Field
              slot={slot}
              value={values[slot.name] ?? slot.value}
              onChange={(value) => {
                setValues({ ...values, [slot.name]: value });
              }}
            />
          </>
        )}
      </View>
    </Sheet>
  );
}

export function FillSheet({ entry, onClose, onCreate }: FillSheetProps): ReactNode {
  if (entry === null) return null;
  return <Steps key={entry.id} entry={entry} onClose={onClose} onCreate={onCreate} />;
}
