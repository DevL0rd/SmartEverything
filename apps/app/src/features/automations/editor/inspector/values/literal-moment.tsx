import type { ReactNode } from 'react';
import { View } from 'react-native';
import { DateNav } from '../../../../../components/date-nav';
import { TimeField } from '../../../../../components/time-field';
import {
  dateOfKey,
  dayKey,
  instantDay,
  instantTimeText,
  instantWith,
  timeOfDayParts,
  timeOfDayText,
} from './literal-model';
import type { LiteralProps } from './literal-scalar';
import type { FieldControl } from '../schema-fields';

type MomentControl = Extract<FieldControl, { t: 'moment' }>;

export function MomentLiteral({
  control,
  label,
  value,
  onChange,
}: LiteralProps<MomentControl>): ReactNode {
  const showsDay = control.of !== 'timeOfDay';
  const showsTime = control.of !== 'date';
  const time =
    control.of === 'instant'
      ? instantTimeText(value)
      : timeOfDayText(timeOfDayParts(value).hour, timeOfDayParts(value).minute);
  return (
    <View className="flex-row flex-wrap items-center gap-3">
      {showsDay ? (
        <DateNav
          range="day"
          value={control.of === 'date' ? dateOfKey(value) : instantDay(value)}
          onChange={(day) => {
            onChange(control.of === 'date' ? dayKey(day) : instantWith(value, day, null));
          }}
        />
      ) : null}
      {showsTime ? (
        <TimeField
          label={label}
          value={timeOfDayParts(time)}
          onChange={(next) => {
            const text = timeOfDayText(next.hour, next.minute);
            onChange(control.of === 'instant' ? instantWith(value, null, text) : text);
          }}
        />
      ) : null}
    </View>
  );
}
