import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Sheet } from '../../components/sheet';
import { twoDigits } from '../../format/number';
import { TimeField, type TimeOfDay } from '../../components/time-field';
import { useHour24 } from '../../store/clock-format';

export function timeOf(text: string): TimeOfDay {
  const [hour = 0, minute = 0] = text.split(':').map(Number);
  return { hour, minute };
}

export function clockText({ hour, minute }: TimeOfDay): string {
  return `${twoDigits(hour)}:${twoDigits(minute)}`;
}

export interface TimeSheetField {
  readonly label: string;
  readonly value: string;
}

export function TimeSheet({
  title,
  fields,
  onSave,
  onClose,
}: {
  readonly title: string;
  readonly fields: readonly TimeSheetField[];
  readonly onSave: (values: readonly string[]) => void;
  readonly onClose: () => void;
}): ReactNode {
  const hour24 = useHour24();
  const [values, setValues] = useState(fields.map((field) => field.value));
  return (
    <Sheet
      open
      onClose={onClose}
      title={title}
      detents={['fit']}
      footer={
        <>
          <Button label="Cancel" variant="text" onPress={onClose} />
          <Button
            label="Save"
            onPress={() => {
              onClose();
              onSave(values);
            }}
          />
        </>
      }
    >
      <View className="gap-4">
        {fields.map((field, index) => (
          <TimeField
            hour24={hour24}
            key={field.label}
            label={field.label}
            value={timeOf(values[index] ?? field.value)}
            onChange={(time) => {
              setValues(values.map((value, at) => (at === index ? clockText(time) : value)));
            }}
          />
        ))}
      </View>
    </Sheet>
  );
}
