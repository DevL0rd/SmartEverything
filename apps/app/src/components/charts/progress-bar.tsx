import type { ReactNode } from 'react';
import { useState } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { useColour } from '../../design/colour';
import { useMotion } from '../../design/motion';
import { useDraw } from '../use-draw';
import type { ColourRole } from '../../design/tokens';
import { percent } from '../../format/number';

export interface ProgressBarProps {
  readonly progress: number;
  readonly colour: ColourRole;
  readonly label: string;
  readonly thick?: boolean;
}

export function ProgressBar({
  progress,
  colour,
  label,
  thick = false,
}: ProgressBarProps): ReactNode {
  const fill = useColour(colour);
  const share = Math.min(1, Math.max(0, progress));
  const drawn = useDraw(share, !useMotion().reduced);
  const track = { backgroundColor: fill, opacity: 0.18 };
  const bar = { backgroundColor: fill };
  const [width, setWidth] = useState(0);
  const grown = useAnimatedStyle<ViewStyle>(
    () => ({ width: width * drawn.get(), opacity: drawn.get() > 0 ? 1 : 0 }),
    [width],
  );
  const dotted = useAnimatedStyle<ViewStyle>(() => ({ opacity: drawn.get() > 0 ? 0 : 1 }));
  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={`${label} ${percent(share)}`}
      className={
        thick ? 'h-2.5 w-full flex-row items-center' : 'h-1.5 w-full flex-row items-center'
      }
      onLayout={(event) => {
        setWidth(event.nativeEvent.layout.width);
      }}
    >
      <View style={track} className="absolute inset-0 rounded-full" />
      <Animated.View style={[bar, grown]} className="h-full rounded-full" />
      <Animated.View
        style={[bar, dotted]}
        className={
          thick ? 'absolute left-0 size-2.5 rounded-full' : 'absolute left-0 size-1.5 rounded-full'
        }
      />
    </View>
  );
}
