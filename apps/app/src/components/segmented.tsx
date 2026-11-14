import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

export type ControlSize = 'touch' | 'control';

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
  readonly compact?: boolean;
  readonly size?: ControlSize;
}

function touchPadding(compact: boolean): string {
  return compact
    ? 'h-12 min-w-touch-min rounded-full px-2'
    : 'h-12 min-w-touch-min rounded-full px-2 medium:px-4';
}

function pointerHeight(size: ControlSize): string {
  return size === 'control' ? 'h-control-h' : 'h-8';
}

interface SegmentLook {
  readonly fill: boolean;
  readonly compact: boolean;
  readonly size: ControlSize;
}

function segmentClass(
  pointer: boolean,
  selected: boolean,
  { fill, compact, size }: SegmentLook,
): string {
  return cn(
    'shrink flex-row items-center justify-center gap-1.5',
    fill && 'flex-auto',
    pointer ? cn(pointerHeight(size), 'min-w-0 rounded-xs px-3') : touchPadding(compact),
    selected ? 'border border-primary bg-primary-container' : 'border border-transparent',
  );
}

function SegmentIcon<T extends string>({
  option,
  selected,
  pointer,
  compact,
}: {
  readonly option: SegmentedOption<T>;
  readonly selected: boolean;
  readonly pointer: boolean;
  readonly compact: boolean;
}): ReactNode {
  if (option.icon !== undefined) {
    return <Icon name={option.icon} size={16} tone={selected ? 'primary' : 'variant'} />;
  }
  return selected && !pointer && !compact ? (
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
  compact,
  size,
  onChange,
}: {
  readonly option: SegmentedOption<T>;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly pointer: boolean;
  readonly fill: boolean;
  readonly compact: boolean;
  readonly size: ControlSize;
  readonly onChange: (value: T) => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      label={option.spoken ?? option.label}
      selected={selected}
      checked={selected}
      disabled={disabled}
      onPress={() => {
        if (!selected) {
          selectionTick();
          onChange(option.value);
        }
      }}
      className={segmentClass(pointer, selected, { fill, compact, size })}
      layerClassName={pointer ? 'rounded-xs' : 'rounded-full'}
    >
      <SegmentIcon option={option} selected={selected} pointer={pointer} compact={compact} />
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
  compact = false,
  size = 'touch',
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
          compact={compact}
          size={size}
          onChange={onChange}
        />
      ))}
    </View>
  );
}
