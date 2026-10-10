import type { ReactNode } from 'react';
import { useState } from 'react';
import { ScrollView, View } from 'react-native';
import { cn } from '../design/cn';
import { useIdiom } from '../design/platform';
import { selectionTick } from '../platform/haptics';
import { Icon, type IconName } from './icon';
import { Interactive } from './interactive';
import { Text } from './text';

export interface SegmentedOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly icon?: IconName;
}

export interface SegmentedProps<T extends string> {
  readonly options: readonly SegmentedOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
  readonly disabled?: boolean;
}

function segmentClass(pointer: boolean, dense: boolean, selected: boolean): string {
  return cn(
    'flex-row items-center justify-center gap-1.5 px-3',
    pointer ? 'h-8 rounded-xs' : 'h-12 rounded-full',
    !pointer && !dense && 'px-4',
    selected && 'bg-primary-container',
  );
}

function SegmentIcon<T extends string>({
  option,
  selected,
  showCheck,
}: {
  readonly option: SegmentedOption<T>;
  readonly selected: boolean;
  readonly showCheck: boolean;
}): ReactNode {
  if (option.icon !== undefined) {
    return <Icon name={option.icon} size={16} tone={selected ? 'primary' : 'variant'} />;
  }
  return selected && showCheck ? <Icon name="check" size={16} tone="primary" /> : null;
}

function Segment<T extends string>({
  option,
  selected,
  disabled,
  pointer,
  dense,
  onChange,
}: {
  readonly option: SegmentedOption<T>;
  readonly selected: boolean;
  readonly disabled: boolean;
  readonly pointer: boolean;
  readonly dense: boolean;
  readonly onChange: (value: T) => void;
}): ReactNode {
  return (
    <Interactive
      role="radio"
      label={option.label}
      selected={selected}
      disabled={disabled}
      onPress={() => {
        if (!selected) {
          selectionTick();
          onChange(option.value);
        }
      }}
      className={segmentClass(pointer, dense, selected)}
      layerClassName={pointer ? 'rounded-xs' : 'rounded-full'}
    >
      <SegmentIcon option={option} selected={selected} showCheck={!pointer && !dense} />
      <Text variant="label" tone={selected ? 'primary' : 'default'} numberOfLines={1}>
        {option.label}
      </Text>
    </Interactive>
  );
}

function SegmentScroll({
  onRoom,
  onNeeded,
  children,
}: {
  readonly onRoom: (width: number) => void;
  readonly onNeeded: (width: number) => void;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="max-w-full self-start">
      <ScrollView
        onLayout={(event) => {
          onRoom(event.nativeEvent.layout.width);
        }}
        onContentSizeChange={onNeeded}
        horizontal
        showsHorizontalScrollIndicator={false}
        className="max-w-full"
        contentContainerClassName="grow-0"
      >
        {children}
      </ScrollView>
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
}: SegmentedProps<T>): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const [room, setRoom] = useState(0);
  const [needed, setNeeded] = useState(0);
  const dense = room > 0 && needed > room;
  return (
    <SegmentScroll
      onRoom={setRoom}
      onNeeded={(width) => {
        if (!dense) {
          setNeeded(width);
        }
      }}
    >
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={label}
        className={cn('flex-row rounded-full border border-outline p-0.5', pointer && 'rounded-sm')}
      >
        {options.map((option) => (
          <Segment
            key={option.value}
            option={option}
            selected={option.value === value}
            disabled={disabled}
            pointer={pointer}
            dense={dense}
            onChange={onChange}
          />
        ))}
      </View>
    </SegmentScroll>
  );
}
