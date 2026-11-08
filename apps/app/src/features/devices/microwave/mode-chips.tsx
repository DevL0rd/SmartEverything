import type { ReactNode } from 'react';
import { View } from 'react-native';
import { microwaveStartable, type MicrowaveMode } from '@smarteverything/domain';
import { FlatChoice } from '../../../components/flat-choice';
import type { IconName } from '../../../components/icon';
import { Text } from '../../../components/text';
import { microwaveModeLabel } from './model';

const MODE_ICONS: Readonly<Record<string, IconName>> = {
  MicroWave: 'radio',
  MicroWaveGrill: 'flame',
  MicroWaveConvection: 'fan',
  Convection: 'fan',
  AirFryer: 'fan',
  Grill: 'flame',
  Deodorization: 'leaf',
};

const DEFAULT_ICON: IconName = 'utensils';

function usableModes(modes: readonly MicrowaveMode[]): readonly MicrowaveMode[] {
  return modes.filter(
    (mode) =>
      mode.supportedOperations.includes('set') || mode.supportedOperations.includes('start'),
  );
}

function Group({
  label,
  modes,
  value,
  disabled,
  onChange,
}: {
  readonly label: string;
  readonly modes: readonly MicrowaveMode[];
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (mode: string) => void;
}): ReactNode {
  return modes.length === 0 ? null : (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} className="flex-row flex-wrap">
      {modes.map((mode) => (
        <FlatChoice
          key={mode.mode}
          role="radio"
          label={microwaveModeLabel(mode.mode)}
          icon={MODE_ICONS[mode.mode] ?? DEFAULT_ICON}
          active={mode.mode === value}
          disabled={disabled}
          onPress={() => {
            onChange(mode.mode);
          }}
        />
      ))}
    </View>
  );
}

export function ModeChips({
  modes,
  value,
  disabled,
  onChange,
}: {
  readonly modes: readonly MicrowaveMode[];
  readonly value: string;
  readonly disabled: boolean;
  readonly onChange: (mode: string) => void;
}): ReactNode {
  const usable = usableModes(modes);
  const startable = usable.filter(microwaveStartable);
  const setOnly = usable.filter((mode) => !microwaveStartable(mode));
  return (
    <View className="gap-2">
      <Group
        label="Start from here"
        modes={startable}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
      {setOnly.length === 0 ? null : (
        <Text variant="caption" tone="variant">
          Set only: start these on the microwave
        </Text>
      )}
      <Group
        label="Set only"
        modes={setOnly}
        value={value}
        disabled={disabled}
        onChange={onChange}
      />
    </View>
  );
}
