import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly spoken?: string;
  readonly icon?: IconName;
}

export interface SegmentedProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
  readonly disabled?: boolean;
  readonly fill?: boolean;
}

function segmentClass(pointer: boolean, selected: boolean, fill: boolean): string {
  return cn(
    'min-w-0 shrink flex-row items-center justify-center gap-1.5',
    fill && 'flex-1',
    pointer ? 'h-8 rounded-xs px-3' : 'h-12 rounded-full px-2 medium:px-4',
    selected ? 'border border-primary bg-primary-container' : 'border border-transparent',
  );
}

function SegmentIcon<T extends string>({
  option,
  selected,
  pointer,
}: {
  readonly option: SegmentedOption<T>;
  readonly selected: boolean;
  readonly pointer: boolean;
}): ReactNode {
  if (option.icon !== undefined) {
    return <Icon name={option.icon} size={16} tone={selected ? 'primary' : 'variant'} />;
  }
  return selected && !pointer ? (
    <View className="hidden medium:flex">
      <Icon name="check" size={16} tone="primary" />
    </View>
  ) : null;
}

function Segment<T extends string>({
  option,
  selected,
  disabled,
  pointer,
  fill,
  onChange,
}: {
  readonly option: SegmentedOption<T>;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly pointer: boolean;
  readonly fill: boolean;
  readonly onChange: (value: T) => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      label={option.spoken ?? option.label}
      selected={selected}
      disabled={disabled}
      onPress={() => {
        if (!selected) {
          selectionTick();
          onChange(option.value);
        }
      }}
      className={segmentClass(pointer, selected, fill)}
      layerClassName={pointer ? 'rounded-xs' : 'rounded-full'}
    >
      <SegmentIcon option={option} selected={selected} pointer={pointer} />
      <Text variant="label" tone="default" numberOfLines={1}>
        {option.label}
      </Text>
    </Interactive>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
  fill = false,
}: SegmentedProps<T>): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className={cn(
        'max-w-full flex-row rounded-full border border-outline p-0.5',
        fill ? 'self-stretch' : 'self-start',
        pointer && 'rounded-sm',
      )}
    >
      {options.map((option) => (
        <Segment
          key={option.value}
          option={option}
          selected={option.value === value}
          disabled={disabled}
          pointer={pointer}
          fill={fill}
          onChange={onChange}
        />
      ))}
    </View>
  );
}
