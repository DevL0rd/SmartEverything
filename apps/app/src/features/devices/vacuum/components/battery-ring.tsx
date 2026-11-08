import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Arc } from '../../../../components/charts';
import { Text } from '../../../../components/text';
import { cn } from '../../../../design/cn';
import type { ColourRole } from '../../../../design/tokens';

export function ringColour(percent: number): ColourRole {
  if (percent >= 30) {
    return 'positive';
  }
  return percent >= 15 ? 'warning' : 'critical';
}

const SIZES = {
  md: { px: 40, frame: 'size-10', thickness: 3 },
  lg: { px: 48, frame: 'size-12', thickness: 4 },
} as const;

export function BatteryRing({
  percent,
  size = 'lg',
}: {
  readonly percent: number;
  readonly size?: keyof typeof SIZES;
}): ReactNode {
  const shown = String(Math.round(percent));
  const look = SIZES[size];
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Battery ${shown} percent`}
      className={cn('items-center justify-center', look.frame)}
    >
      <Arc
        value={percent / 100}
        size={look.px}
        thickness={look.thickness}
        colour={ringColour(percent)}
      />
      <View className="absolute">
        <Text variant="caption" className="tabular">{`${shown}%`}</Text>
      </View>
    </View>
  );
}
