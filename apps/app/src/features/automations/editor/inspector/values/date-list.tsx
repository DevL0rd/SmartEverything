import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../../../components/button';
import { DateNav } from '../../../../../components/date-nav';
import { IconButton } from '../../../../../components/icon-button';
import { Text } from '../../../../../components/text';
import type { FieldControl } from '../schema-fields';
import { dateOfKey, dayKey } from './literal-model';
import type { LiteralProps } from './literal-scalar';
import { dateList, nextFreeDay, replacedDate, withDate, withoutDate } from './moment-model';

export function DateListLiteral({
  label,
  value,
  disabled,
  onChange,
}: LiteralProps<FieldControl>): ReactNode {
  const dates = dateList(value);
  return (
    <View className="gap-2">
      {dates.length === 0 ? (
        <Text variant="footnote" tone="variant">
          No dates yet
        </Text>
      ) : null}
      {dates.map((date, index) => (
        <View key={date} className="min-h-touch-min flex-row items-center gap-2">
          <View className="min-w-0 flex-1">
            <DateNav
              range="day"
              value={dateOfKey(date)}
              onChange={(day) => {
                if (!disabled) onChange([...replacedDate(dates, index, dayKey(day))]);
              }}
            />
          </View>
          <IconButton
            icon="close"
            label={`Remove ${date} from ${label}`}
            disabled={disabled}
            onPress={() => {
              onChange([...withoutDate(dates, index)]);
            }}
          />
        </View>
      ))}
      <View className="self-start">
        <Button
          label="Add a date"
          icon="plus"
          variant="tonal"
          disabled={disabled}
          onPress={() => {
            onChange([...withDate(dates, nextFreeDay(dates, dayKey(new Date())))]);
          }}
        />
      </View>
    </View>
  );
}
