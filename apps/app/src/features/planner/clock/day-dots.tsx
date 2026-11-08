import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { weekdayLetterOf, weekdayNameOf, weekOrderOf } from './alarm-text';

export interface DayDotsProps {
  readonly days: readonly number[];
  readonly weekStart: number;
  readonly onToggle?: (day: number) => void;
  readonly disabled?: boolean;
}

const DOT = 'size-7 items-center justify-center rounded-full';
const ON = 'border border-primary bg-primary-container';
const OFF = 'bg-surface-3';

function Dot({ day, on }: { readonly day: number; readonly on: boolean }): ReactNode {
  return (
    <View className={cn(DOT, on ? ON : OFF)}>
      <Text variant="caption" tone={on ? 'onPrimaryContainer' : 'variant'}>
        {weekdayLetterOf(day)}
      </Text>
    </View>
  );
}

function ToggleDot({
  day,
  on,
  onToggle,
  disabled,
}: {
  readonly day: number;
  readonly on: boolean;
  readonly onToggle: (day: number) => void;
  readonly disabled: boolean;
}): ReactNode {
  return (
    <Interactive
      label={weekdayNameOf(day)}
      role="checkbox"
      checked={on}
      disabled={disabled}
      onPress={() => {
        onToggle(day);
      }}
      className="min-h-touch-min min-w-touch-min items-center justify-center rounded-full"
      layerClassName="rounded-full"
    >
      <Dot day={day} on={on} />
    </Interactive>
  );
}

function daysLabelOf(days: readonly number[], order: readonly number[]): string {
  const on = order.filter((day) => days.includes(day));
  return on.length === 0 ? 'No repeat days' : `Rings on ${on.map(weekdayNameOf).join(', ')}`;
}

export function DayDots({ days, weekStart, onToggle, disabled = false }: DayDotsProps): ReactNode {
  const order = weekOrderOf(weekStart);
  if (onToggle !== undefined) {
    return (
      <View className="flex-row flex-wrap items-center">
        {order.map((day) => (
          <ToggleDot
            key={day}
            day={day}
            on={days.includes(day)}
            onToggle={onToggle}
            disabled={disabled}
          />
        ))}
      </View>
    );
  }
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={daysLabelOf(days, order)}
      className="flex-row flex-wrap items-center gap-1"
    >
      {order.map((day) => (
        <Dot key={day} day={day} on={days.includes(day)} />
      ))}
    </View>
  );
}
