import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Button } from '../../components/button';
import { Sheet } from '../../components/sheet';
import { TimeField, localeUsesHour12, type TimeOfDay } from '../../components/time-field';

export function timeOf(text: string): TimeOfDay {
  const [hour = 0, minute = 0] = text.split(':').map(Number);
  return { hour, minute };
}

export function clockText({ hour, minute }: TimeOfDay): string {
  return `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`;
}

export function timeLabel(text: string): string {
  const { hour, minute } = timeOf(text);
  return new Date(2000, 0, 1, hour, minute).toLocaleTimeString(undefined, {
    hour: 'numeric',
    minute: '2-digit',
  });
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
            key={field.label}
            label={field.label}
            value={timeOf(values[index] ?? field.value)}
            hour12={localeUsesHour12()}
            onChange={(time) => {
              setValues(values.map((value, at) => (at === index ? clockText(time) : value)));
            }}
          />
        ))}
      </View>
    </Sheet>
  );
}
