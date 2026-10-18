import type { ReactNode } from 'react';
import { View } from 'react-native';
import { z } from 'zod';
import { DateNav } from '../../../components/date-nav';
import { Text } from '../../../components/text';
import { TimeField, localeUsesHour12 } from '../../../components/time-field';
import { twoDigits } from '../../../format/number';
import { localDayKey } from '../../../format/time';

const DEFAULT_UPDATE_HOUR = 3;
const DAY_TIME = z.preprocess(
  (text) => (typeof text === 'string' ? text.split(':').map(Number) : text),
  z.tuple([z.number().int().min(0).max(23), z.number().int().min(0).max(59)]),
);

export const DEFAULT_UPDATE_TIME = `${twoDigits(DEFAULT_UPDATE_HOUR)}:00`;

export function defaultUpdateDate(): string {
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  return localDayKey(tomorrow);
}
export function DateField({
  label,
  value,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <View className="gap-2">
      <Text variant="callout" tone="variant">
        {label}
      </Text>
      <DateNav
        value={new Date(`${value}T00:00:00`)}
        range="day"
        onChange={(date) => {
          onChange(localDayKey(date));
        }}
      />
    </View>
  );
}
export function TimeOfDayField({
  label,
  value,
  helper,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly helper: string | undefined;
  readonly onChange: (value: string) => void;
}): ReactNode {
  const [hour, minute] = DAY_TIME.parse(value);
  return (
    <View className="gap-2">
      <TimeField
        label={label}
        value={{ hour, minute }}
        hour12={localeUsesHour12()}
        onChange={(time) => {
          onChange(`${twoDigits(time.hour)}:${twoDigits(time.minute)}`);
        }}
      />
      {helper === undefined ? null : (
        <Text variant="footnote" tone="variant">
          {helper}
        </Text>
      )}
    </View>
  );
}
