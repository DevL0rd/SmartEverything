import { BOTTLE_BODIES, type BottleBody } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useColour } from '../../../design/colour';
import { selectionTick } from '../../../platform/haptics';
import { rounded } from '../../../features/device-visuals/parts/shapes';

const OUTLINES: Readonly<Record<BottleBody, { readonly width: number; readonly height: number }>> =
  {
    680: { width: 22, height: 46 },
    1000: { width: 26, height: 58 },
  };

const LABELS: Readonly<Record<BottleBody, string>> = { 680: '680 ml', 1000: '1 litre' };

function Outline({
  body,
  selected,
}: {
  readonly body: BottleBody;
  readonly selected: boolean;
}): ReactNode {
  const stroke = useColour(selected ? 'primary' : 'on-surface-variant');
  const size = OUTLINES[body];
  return (
    <Svg width={48} height={64} viewBox="0 0 48 64">
      <Path
        d={rounded({
          x: 24 - size.width / 2,
          y: 62 - size.height,
          w: size.width,
          h: size.height,
          r: 7,
        })}
        fill="none"
        stroke={stroke}
        strokeWidth={2}
      />
      <Path
        d={rounded({
          x: 24 - size.width / 2 - 1,
          y: 62 - size.height - 6,
          w: size.width + 2,
          h: 8,
          r: 3,
        })}
        fill={stroke}
        fillOpacity={0.5}
      />
    </Svg>
  );
}

export function BodyPicker({
  value,
  disabled,
  onChange,
}: {
  readonly value: BottleBody;
  readonly disabled: boolean;
  readonly onChange: (body: BottleBody) => void;
}): ReactNode {
  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel="Bottle size"
      className="flex-row gap-3 px-4 py-3"
    >
      {BOTTLE_BODIES.map((body) => {
        const selected = body === value;
        return (
          <Interactive
            key={body}
            role="radio"
            label={LABELS[body]}
            selected={selected}
            disabled={disabled}
            onPress={() => {
              if (!selected) {
                selectionTick();
                onChange(body);
              }
            }}
            className={cn(
              'min-h-touch-min flex-1 items-center gap-1 rounded-lg border px-3 py-2',
              selected ? 'border-primary bg-primary-container' : 'border-outline-variant',
            )}
          >
            <Outline body={body} selected={selected} />
            <Text variant="label">{LABELS[body]}</Text>
          </Interactive>
        );
      })}
    </View>
  );
}
