import type { ReactNode } from 'react';
import { View } from 'react-native';
import { IconButton } from '../../../components/icon-button';
import { Text } from '../../../components/text';
import { nudgeClock } from '../model/settings-model';

export function ClockStepper({
  label,
  value,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (value: string) => void;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      accessibilityValue={{ text: value }}
      accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
      onAccessibilityAction={(event) => {
        onChange(nudgeClock(value, event.nativeEvent.actionName === 'increment' ? 1 : -1));
      }}
      className="min-h-touch-min flex-row items-center justify-between gap-3"
    >
      <Text variant="body">{label}</Text>
      <View className="flex-row items-center gap-1">
        <IconButton
          icon="minus"
          label={`${label} 15 minutes earlier`}
          disabled={disabled}
          onPress={() => {
            onChange(nudgeClock(value, -1));
          }}
        />
        <Text variant="body-strong" align="center" className="min-w-14 tabular">
          {value}
        </Text>
        <IconButton
          icon="plus"
          label={`${label} 15 minutes later`}
          disabled={disabled}
          onPress={() => {
            onChange(nudgeClock(value, 1));
          }}
        />
      </View>
    </View>
  );
}
