import type { ReactNode } from 'react';
import { View } from 'react-native';
import { cn } from '../../design/cn';
import { useColour } from '../../design/colour';
import type { ColourRole } from '../../design/tokens';
import { Text } from '../text';
import { useMeasuredWidth } from '../use-measured-width';
import { EmptyGraph } from './empty-graph';
import {
  placeSegment,
  shareOf,
  windowOf,
  type TimelineFrame,
  type TimelineSegment,
  type TimelineWindow,
} from './timeline-model';

export interface StateTimelineProps<S extends string> {
  readonly segments: readonly TimelineSegment<S>[];
  readonly colours: Readonly<Record<S, ColourRole>>;
  readonly label: string;
  readonly lanes?: readonly S[];
  readonly height?: number;
  readonly from?: number;
  readonly to?: number;
  readonly ticks?: readonly number[];
  readonly captions?: readonly string[];
  readonly empty?: string;
  readonly track?: keyof typeof TRACK;
}

const TRACK = { 'surface-2': 'bg-surface-2', 'surface-3': 'bg-surface-3' } as const;

const DEFAULT_HEIGHT = 14;
const TICK_OPACITY = 0.5;

function Block({
  place,
  colour,
}: {
  readonly place: ReturnType<typeof placeSegment>;
  readonly colour: ColourRole;
}): ReactNode {
  const fill = { backgroundColor: useColour(colour) };
  return (
    <View style={place} className="absolute p-px">
      <View style={fill} className="flex-1 rounded-xs" />
    </View>
  );
}

function Tick({ left }: { readonly left: number }): ReactNode {
  const place = { left, opacity: TICK_OPACITY };
  return <View style={place} className="absolute inset-y-0 w-px bg-on-surface" />;
}

function Captions({ captions }: { readonly captions: readonly string[] }): ReactNode {
  return (
    <View className="flex-row justify-between">
      {captions.map((caption, index) => (
        <Text
          key={`${caption}-${String(index)}`}
          variant="caption"
          tone="faint"
          className="tabular"
        >
          {caption}
        </Text>
      ))}
    </View>
  );
}

function Track<S extends string>({
  segments,
  colours,
  label,
  lanes,
  height,
  ticks,
  track,
  window,
}: Pick<StateTimelineProps<S>, 'segments' | 'colours' | 'label' | 'lanes' | 'track'> & {
  readonly height: number;
  readonly ticks: readonly number[];
  readonly window: TimelineWindow;
}): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const frame: TimelineFrame = {
    from: window.from,
    span: Math.max(1, window.to - window.from),
    width,
    height,
  };
  const box = { height };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      style={box}
      className={cn('relative overflow-hidden rounded-sm', TRACK[track ?? 'surface-3'])}
      onLayout={onLayout}
    >
      {segments.map((segment) => (
        <Block
          key={`${String(segment.start)}-${segment.state}`}
          place={placeSegment(segment, lanes, frame)}
          colour={colours[segment.state]}
        />
      ))}
      {ticks.map((tick) => (
        <Tick key={tick} left={shareOf(tick, window) * width} />
      ))}
    </View>
  );
}

export function StateTimeline<S extends string>({
  segments,
  from,
  to,
  height = DEFAULT_HEIGHT,
  ticks = [],
  captions = [],
  empty,
  ...rest
}: StateTimelineProps<S>): ReactNode {
  const window = windowOf(segments, {
    ...(from === undefined ? {} : { from }),
    ...(to === undefined ? {} : { to }),
  });
  if (window === null || segments.length === 0) {
    return empty === undefined ? null : <EmptyGraph text={empty} height={height} />;
  }
  return (
    <View className="gap-1">
      <Track {...rest} segments={segments} height={height} ticks={ticks} window={window} />
      {captions.length === 0 ? null : <Captions captions={captions} />}
    </View>
  );
}
