import type { ReactNode } from 'react';
import { View } from 'react-native';
import {
  microwaveDuration,
  microwaveSeconds,
  type MicrowaveTimeRange,
} from '@smarteverything/domain';
import { IconButton } from '../../../components/icon-button';
import { FlatChoice } from '../../../components/flat-choice';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { duration, playTime } from '../../../format/time';
import { selectionTick } from '../../../platform/haptics';
import { durationBounds, snapSeconds } from './duration';
import { QUICK_SECONDS } from './quick-model';

function Stepper({
  seconds,
  bounds,
  disabled,
  set,
}: {
  readonly seconds: number;
  readonly bounds: ReturnType<typeof durationBounds>;
  readonly disabled: boolean;
  readonly set: (seconds: number) => void;
}): ReactNode {
  return (
    <View className="flex-row items-center gap-2">
      <IconButton
        icon="minus"
        label="Less time"
        variant="tonal"
        disabled={disabled || seconds <= bounds.min}
        onPress={() => {
          set(seconds - bounds.step);
        }}
      />
      <Text
        variant="title-3"
        align="center"
        className={cn('min-w-16 tabular', disabled && 'opacity-40')}
      >
        {playTime(seconds)}
      </Text>
      <IconButton
        icon="plus"
        label="More time"
        variant="tonal"
        disabled={disabled || seconds >= bounds.max}
        onPress={() => {
          set(seconds + bounds.step);
        }}
      />
    </View>
  );
}

function QuickChips({
  bounds,
  seconds,
  disabled,
  set,
}: {
  readonly bounds: ReturnType<typeof durationBounds>;
  readonly seconds: number;
  readonly disabled: boolean;
  readonly set: (seconds: number) => void;
}): ReactNode {
  const choices = QUICK_SECONDS.filter(
    (quick) =>
      quick >= bounds.min && quick <= bounds.max && (quick - bounds.min) % bounds.step === 0,
  );
  return (
    <View
      className="flex-row flex-wrap"
      accessibilityRole="radiogroup"
      accessibilityLabel="Quick time"
    >
      {choices.map((quick) => (
        <FlatChoice
          key={quick}
          role="radio"
          label={duration(quick)}
          active={quick === seconds}
          disabled={disabled}
          onPress={() => {
            set(quick);
          }}
        />
      ))}
    </View>
  );
}

export function TimeControl({
  range,
  value,
  disabled,
  onChange,
}: {
  readonly range: MicrowaveTimeRange;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}): ReactNode {
  const bounds = durationBounds(range);
  const seconds = microwaveSeconds(value);
  const set = (next: number): void => {
    const snapped = snapSeconds(next, bounds);
    if (snapped !== seconds) {
      selectionTick();
      onChange(microwaveDuration(snapped));
    }
  };
  return (
    <View className="gap-3">
      <View className="flex-row items-center justify-between gap-3">
        <Text variant="callout">Time</Text>
        <Stepper seconds={seconds} bounds={bounds} disabled={disabled} set={set} />
      </View>
      <QuickChips bounds={bounds} seconds={seconds} disabled={disabled} set={set} />
    </View>
  );
}
