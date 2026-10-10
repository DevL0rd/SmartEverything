import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Arc } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { amountText } from '../model/macros';

export type DialSize = 'xs' | 's' | 'm' | 'l';

const DIAL_PIXELS: Readonly<Record<DialSize, number>> = { xs: 88, s: 112, m: 128, l: 152 };

const DIAL_CLASS: Readonly<Record<DialSize, string>> = {
  xs: 'size-22',
  s: 'size-28',
  m: 'size-32',
  l: 'size-38',
};

function captionOf(value: number, goal: number | null, size: DialSize): string {
  if (goal === null) {
    return 'kcal eaten';
  }
  if (size === 'xs') {
    return 'kcal';
  }
  return value > goal
    ? `kcal · ${amountText(value - goal, 'kcal')} over`
    : `kcal · ${amountText(goal - value, 'kcal')} left`;
}

export function CalorieDial({
  eaten,
  goal,
  size,
}: {
  readonly eaten: number | null;
  readonly goal: number | null;
  readonly size: DialSize;
}): ReactNode {
  const value = eaten ?? 0;
  const over = goal !== null && value > goal;
  const caption = captionOf(value, goal, size);
  return (
    <View className={cn('items-center justify-center', DIAL_CLASS[size])}>
      {goal === null ? null : (
        <View className="absolute inset-0">
          <Arc
            value={value / goal}
            size={DIAL_PIXELS[size]}
            thickness={Math.round(DIAL_PIXELS[size] / 11)}
            colour={over ? 'warning' : 'viz-2'}
            startAngle={-135}
            sweep={270}
            tinted
          />
        </View>
      )}
      <Figure value={amountText(value, 'kcal')} size={goal === null || size !== 'xs' ? 'm' : 's'} />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {caption}
      </Text>
    </View>
  );
}
