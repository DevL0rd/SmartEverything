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
import { markerLeft, spanOf } from './progress-span';

export interface ProgressBarProps {
  readonly progress: number | null;
  readonly colour: ColourRole;
  readonly label: string;
  readonly thick?: boolean;
  readonly from?: number;
  readonly marker?: number | null;
}

export interface SegmentBarProps {
  readonly segments: readonly ColourRole[];
  readonly marker: number;
  readonly label: string;
}

const MARKER_CLASS = 'absolute top-0 rounded-full border-2 border-surface-1 bg-on-surface';

function Marker({
  share,
  width,
  size,
}: {
  readonly share: number;
  readonly width: number;
  readonly size: 'size-3' | 'size-4';
}): ReactNode {
  const left = { left: markerLeft(width, share, size === 'size-3' ? 12 : 16) };
  return <View style={left} className={cn(MARKER_CLASS, size)} />;
}

function Segment({ colour }: { readonly colour: ColourRole }): ReactNode {
  const fill = { backgroundColor: useColour(colour) };
  return <View style={fill} className="h-2 flex-1 rounded-full" />;
}

export function SegmentBar({ segments, marker, label }: SegmentBarProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="h-4 w-full justify-center"
      onLayout={onLayout}
    >
      <View className="flex-row gap-1">
        {segments.map((colour, index) => (
          <Segment key={`${colour}-${String(index)}`} colour={colour} />
        ))}
      </View>
      <Marker share={marker} width={width} size="size-4" />
    </View>
  );
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
        <Marker share={marker} width={width} size={thick ? 'size-4' : 'size-3'} />
      )}
    </View>
  );
}
