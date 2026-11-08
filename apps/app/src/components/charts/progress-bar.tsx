import type { ReactNode } from 'react';
import { View, type ViewStyle } from 'react-native';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { cn } from '../../design/cn';
import { useColour } from '../../design/colour';
import { useMotion } from '../../design/motion';
import type { ColourRole } from '../../design/tokens';
import { percent } from '../../format/number';
import { useDraw } from '../use-draw';
import { useMeasuredWidth } from '../use-measured-width';
import { spanOf } from './progress-span';
import { BarMarker } from './segment-bar';

export interface ProgressBarProps {
  readonly progress: number | null;
  readonly colour: ColourRole;
  readonly label: string;
  readonly thick?: boolean;
  readonly from?: number;
  readonly marker?: number | null;
}

interface LayersProps {
  readonly progress: number | null;
  readonly colour: ColourRole;
  readonly from: number | undefined;
  readonly thick: boolean;
  readonly width: number;
}

function Layers({ progress, colour, from, thick, width }: LayersProps): ReactNode {
  const fill = useColour(colour);
  const { start, end } = spanOf(progress ?? 0, from);
  const drawn = useDraw(end, !useMotion().reduced);
  const track = { backgroundColor: fill, opacity: 0.18 };
  const bar = { backgroundColor: fill };
  const grown = useAnimatedStyle<ViewStyle>(
    () => ({
      left: width * start,
      width: width * Math.max(0, drawn.get() - start),
      opacity: drawn.get() > start ? 1 : 0,
    }),
    [width, start],
  );
  const dotted = useAnimatedStyle<ViewStyle>(() => ({ opacity: drawn.get() > 0 ? 0 : 1 }));
  const dot = thick ? 'size-2.5' : 'size-1.5';
  return (
    <View className={cn('w-full flex-row items-center', thick ? 'h-2.5' : 'h-1.5')}>
      <View style={track} className="absolute inset-0 rounded-full" />
      {progress === null ? null : (
        <Animated.View style={[bar, grown]} className="absolute h-full rounded-full" />
      )}
      {progress === null || from !== undefined ? null : (
        <Animated.View style={[bar, dotted]} className={cn('absolute left-0 rounded-full', dot)} />
      )}
    </View>
  );
}

function frameOf(thick: boolean, marked: boolean): string {
  if (!marked) {
    return 'w-full justify-center';
  }
  return thick ? 'h-4 w-full justify-center' : 'h-3 w-full justify-center';
}

export function ProgressBar({
  progress,
  colour,
  label,
  thick = false,
  from,
  marker = null,
}: ProgressBarProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const plain = from === undefined && marker === null;
  return (
    <View
      accessible
      accessibilityRole={plain ? 'progressbar' : 'image'}
      accessibilityLabel={plain ? `${label} ${percent(spanOf(progress ?? 0, from).end)}` : label}
      className={frameOf(thick, marker !== null)}
      onLayout={onLayout}
    >
      <Layers progress={progress} colour={colour} from={from} thick={thick} width={width} />
      {marker === null ? null : (
        <BarMarker share={marker} width={width} size={thick ? 'size-4' : 'size-3'} />
      )}
    </View>
  );
}
