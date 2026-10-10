import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import { HSV_COLOR, type HsvColor, type PresentedCapability } from '@smarteverything/domain';
import { Slider } from '../../../components/slider';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { selectionTick } from '../../../platform/haptics';
import { useControl } from '../../../store/control';

const SWATCHES: readonly { readonly name: string; readonly colour: HsvColor }[] = [
  { name: 'Warm', colour: { hue: 32, saturation: 52, value: 100 } },
  { name: 'Candle', colour: { hue: 24, saturation: 65, value: 100 } },
  { name: 'Daylight', colour: { hue: 45, saturation: 5, value: 96 } },
  { name: 'Ice', colour: { hue: 212, saturation: 19, value: 100 } },
  { name: 'Rose', colour: { hue: 350, saturation: 45, value: 100 } },
  { name: 'Violet', colour: { hue: 254, saturation: 39, value: 100 } },
  { name: 'Teal', colour: { hue: 178, saturation: 56, value: 83 } },
  { name: 'Lime', colour: { hue: 77, saturation: 50, value: 88 } },
];

function cssOfHsv(colour: HsvColor): string {
  const lightness = (colour.value / 100) * (1 - colour.saturation / 200);
  const denominator = Math.min(lightness, 1 - lightness);
  const saturation = denominator === 0 ? 0 : (colour.value / 100 - lightness) / denominator;
  return `hsl(${String(colour.hue)}, ${String(Math.round(saturation * 100))}%, ${String(Math.round(lightness * 100))}%)`;
}

function same(left: HsvColor | null, right: HsvColor): boolean {
  return (
    left !== null &&
    left.hue === right.hue &&
    left.saturation === right.saturation &&
    left.value === right.value
  );
}

function Swatch({
  name,
  colour,
  selected,
  onPick,
}: {
  readonly name: string;
  readonly colour: HsvColor;
  readonly selected: boolean;
  readonly onPick: (colour: HsvColor) => void;
}): ReactNode {
  const fill = { backgroundColor: cssOfHsv(colour) };
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ checked: selected }}
      onPress={() => {
        selectionTick();
        onPick(colour);
      }}
      style={fill}
      className={cn(
        'size-touch-min rounded-full border-2',
        selected ? 'border-on-surface' : 'border-transparent',
      )}
    />
  );
}

export function ColourBlock({
  deviceId,
  presented,
}: {
  readonly deviceId: string;
  readonly presented: PresentedCapability;
}): ReactNode {
  const control = useControl(deviceId, presented.key);
  const parsed = HSV_COLOR.safeParse(control.value);
  const current = parsed.success ? parsed.data : null;
  const pick = (colour: HsvColor): void => {
    void control.set(colour);
  };
  return (
    <View className="gap-3">
      <Text variant="body">{presented.label}</Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={presented.label}
        className="flex-row flex-wrap gap-2"
      >
        {SWATCHES.map((swatch) => (
          <Swatch
            key={swatch.name}
            name={swatch.name}
            colour={swatch.colour}
            selected={same(current, swatch.colour)}
            onPick={pick}
          />
        ))}
      </View>
      {current === null ? null : (
        <Slider
          label={`${presented.label} hue`}
          value={current.hue}
          min={0}
          max={360}
          step={1}
          formatValue={(hue) => `${String(hue)}°`}
          onCommit={(hue) => {
            pick({ ...current, hue });
          }}
        />
      )}
    </View>
  );
}
