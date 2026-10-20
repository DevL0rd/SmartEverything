import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg from 'react-native-svg';
import { Text } from '../../../components/text';
import { useMeasuredWidth } from '../../../components/use-measured-width';
import { PLOT_HEIGHT, PLOT_PAD } from '../model/care-model';

export function plotX(value: number, span: number): number {
  return PLOT_PAD + value * (span - 2 * PLOT_PAD);
}

export function plotY(value: number): number {
  return PLOT_HEIGHT - PLOT_PAD - value * (PLOT_HEIGHT - 2 * PLOT_PAD);
}

export function PlotFrame({
  label,
  note,
  children,
}: {
  readonly label: string;
  readonly note: string;
  readonly children: (width: number) => ReactNode;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={label} className="gap-1">
      <View onLayout={onLayout} className="h-28">
        {width > 0 ? (
          <Svg width={width} height={PLOT_HEIGHT}>
            {children(width)}
          </Svg>
        ) : null}
      </View>
      <Text variant="caption" tone="faint">
        {note}
      </Text>
    </View>
  );
}
