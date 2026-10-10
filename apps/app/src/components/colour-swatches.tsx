import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../design/cn';
import { selectionTick } from '../platform/haptics';
import { Interactive } from './interactive';

interface ColourOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly swatchClassName: string;
}

export interface ColourSwatchesProps<T extends string> {
  readonly options: readonly ColourOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
  readonly label: string;
  readonly disabled?: boolean;
}

export function ColourSwatches<T extends string>({
  options,
  value,
  onChange,
  label,
  disabled = false,
}: ColourSwatchesProps<T>): ReactNode {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
      className="flex-row flex-wrap gap-1"
    >
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Interactive
            key={option.value}
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
            className="min-h-touch-min min-w-touch-min items-center justify-center rounded-full"
            layerClassName="rounded-full"
          >
            <View
              className={cn(
                'size-10 items-center justify-center rounded-full border-2',
                selected ? 'border-on-surface' : 'border-transparent',
              )}
            >
              <View className={cn('size-8 rounded-full', option.swatchClassName)} />
            </View>
          </Interactive>
        );
      })}
    </View>
  );
}
