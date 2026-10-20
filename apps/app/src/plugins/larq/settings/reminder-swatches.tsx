import { BOTTLE_COLOURS } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Interactive } from '../../../components/interactive';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';

type Swatch = (typeof BOTTLE_COLOURS)[number]['id'];

function Dot({ hex, selected }: { readonly hex: string; readonly selected: boolean }): ReactNode {
  const fill = { backgroundColor: hex };
  return (
    <View
      className={cn(
        'size-10 items-center justify-center rounded-full border-2',
        selected ? 'border-on-surface' : 'border-transparent',
      )}
    >
      <View style={fill} className="size-8 rounded-full border-hairline border-outline" />
    </View>
  );
}

export function ReminderSwatches({
  value,
  disabled,
  onChange,
}: {
  readonly value: Swatch;
  readonly disabled: boolean;
  readonly onChange: (value: Swatch) => void;
}): ReactNode {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Reminder colour"
      className="flex-row flex-wrap gap-1"
    >
      {BOTTLE_COLOURS.map((colour) => {
        const selected = colour.id === value;
        return (
          <Interactive
            key={colour.id}
            role="radio"
            label={colour.label}
            selected={selected}
            disabled={disabled}
            onPress={() => {
              if (!selected) {
                selectionTick();
                onChange(colour.id);
              }
            }}
            className="min-h-touch-min min-w-touch-min items-center justify-center rounded-full"
            layerClassName="rounded-full"
          >
            <Dot hex={colour.hex} selected={selected} />
          </Interactive>
        );
      })}
    </View>
  );
}
