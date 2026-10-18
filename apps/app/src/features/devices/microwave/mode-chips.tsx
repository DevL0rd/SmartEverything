import type { ReactNode } from 'react';
import { View } from 'react-native';
import { microwaveStartable, type MicrowaveMode } from '@smarteverything/domain';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
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

function Chip({
  mode,
  selected,
  disabled,
  onPress,
}: {
  readonly mode: MicrowaveMode;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly onPress: () => void;
}): ReactNode {
  const label = microwaveModeLabel(mode.mode);
  return (
    <Interactive
      label={label}
      role="radio"
      selected={selected}
      checked={selected}
      disabled={disabled}
      onPress={onPress}
      className={cn(
        'min-h-touch-min flex-row items-center gap-1.5 rounded-full border-hairline px-3',
        selected ? 'border-primary bg-primary-container' : 'border-outline-variant bg-surface-1',
        disabled && 'opacity-50',
      )}
      layerClassName="rounded-full"
    >
      <Icon
        name={MODE_ICONS[mode.mode] ?? DEFAULT_ICON}
        size={16}
        tone={selected ? 'primary' : 'variant'}
      />
      <Text variant="label" tone={selected ? 'primary' : 'default'} numberOfLines={1}>
        {label}
      </Text>
    </Interactive>
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
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row flex-wrap gap-2"
    >
      {modes.map((mode) => (
        <Chip
          key={mode.mode}
          mode={mode}
          selected={mode.mode === value}
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
