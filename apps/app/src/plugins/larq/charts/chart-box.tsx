import type { ReactNode } from 'react';
import { View } from 'react-native';
import { useMeasuredWidth } from '../../../components/use-measured-width';

export function ChartBox({
  label,
  height,
  children,
}: {
  readonly label: string;
  readonly height: number | ((width: number) => number);
  readonly children: (width: number) => ReactNode;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const frame = { height: typeof height === 'number' ? height : height(width) };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      onLayout={onLayout}
      style={frame}
      className="w-full"
    >
      {width > 0 ? children(width) : null}
    </View>
  );
}
