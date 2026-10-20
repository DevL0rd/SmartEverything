import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { View, type AccessibilityActionEvent, type ViewProps } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg from 'react-native-svg';
import { useIdiom } from '../../design/platform';
import { useMeasuredWidth } from '../use-measured-width';
import { scrubGesture } from './chart-parts';
import { useStepKeys, type StepKeys } from './use-step-keys';
import {
  HEIGHT_COMPACT,
  HEIGHT_DESKTOP,
  HEIGHT_PHONE,
  frameOf,
  isUnstaged,
  readoutOf,
  spanAt,
  stepAt,
  summaryOf,
  type HypnogramFrame,
  type HypnogramSegment,
} from './hypnogram-model';
import {
  AsleepBand,
  AxisMarks,
  Blocks,
  Cursor,
  Ghost,
  Guides,
  LaneLabels,
  Markers,
  TickLabels,
} from './hypnogram-parts';
import { isNarrowNight, nightAt, nightTicks, nightWindow, type NightWindow } from './night-axis';

export type { HypnogramSegment, HypnogramStage } from './hypnogram-model';

export interface HypnogramProps {
  readonly segments: readonly HypnogramSegment[];
  readonly label: string;
  readonly compact?: boolean;
  readonly markers?: boolean;
  readonly height?: number;
  readonly at?: number | null;
  readonly onAt?: (at: number | null) => void;
  readonly from?: number;
  readonly to?: number;
}

type Reading = Pick<ViewProps, 'accessibilityLabel' | 'accessibilityHint' | 'accessibilityValue'>;

function readingOf(
  segments: readonly HypnogramSegment[],
  label: string,
  current: number | null,
): Reading {
  const segment = current === null ? null : spanAt(segments, current);
  return {
    accessibilityLabel: summaryOf(segments, label),
    accessibilityHint: 'Swipe up or down to move through stages.',
    ...(segment === null ? {} : { accessibilityValue: { text: readoutOf(segment).text } }),
  };
}

interface Scrub {
  readonly gesture: ReturnType<typeof scrubGesture> | ReturnType<typeof Gesture.Race>;
  readonly onAction: (event: AccessibilityActionEvent) => void;
  readonly keys: StepKeys;
}

function useScrub(
  frame: HypnogramFrame,
  segments: readonly HypnogramSegment[],
  current: number | null,
  set: (at: number | null) => void,
): Scrub {
  const pointer = useIdiom() === 'pointer';
  const scrub = scrubGesture(pointer, (point) => {
    if (point !== null) {
      set(nightAt(frame, point.x));
    } else if (pointer) {
      set(null);
    }
  });
  const clear = Gesture.Tap()
    .runOnJS(true)
    .onEnd(() => {
      set(null);
    });
  const step = (direction: 1 | -1): void => {
    set(stepAt(segments, current, direction));
  };
  const keys = useStepKeys(step, () => {
    set(null);
  });
  return {
    gesture: pointer ? scrub : Gesture.Race(scrub, clear),
    onAction: (event): void => {
      const name = event.nativeEvent.actionName;
      if (name === 'increment' || name === 'decrement') {
        step(name === 'increment' ? 1 : -1);
      }
    },
    keys,
  };
}

const ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

interface ChartProps extends HypnogramProps {
  readonly frame: HypnogramFrame;
  readonly current: number | null;
  readonly set: (at: number | null) => void;
}

function Plot({
  frame,
  segments,
  compact,
  active,
}: {
  readonly frame: HypnogramFrame;
  readonly segments: readonly HypnogramSegment[];
  readonly compact: boolean;
  readonly active: HypnogramSegment | null;
}): ReactNode {
  const ticks = nightTicks(frame.window, isNarrowNight(frame.right - frame.left));
  const unstaged = isUnstaged(segments);
  return (
    <>
      <View pointerEvents="none" className="absolute inset-0">
        <Svg width={frame.width} height={frame.height}>
          <Guides frame={frame} ticks={ticks} lanes={!unstaged} vertical={!compact} />
          {compact ? null : <AxisMarks frame={frame} ticks={ticks} />}
          {unstaged ? (
            <AsleepBand frame={frame} />
          ) : (
            <Blocks segments={segments} frame={frame} active={active} />
          )}
        </Svg>
      </View>
      {compact || unstaged ? null : <LaneLabels frame={frame} />}
      {compact ? null : <TickLabels frame={frame} ticks={ticks} />}
    </>
  );
}

function Chart({
  frame,
  segments,
  label,
  compact = false,
  markers = true,
  current,
  set,
}: ChartProps): ReactNode {
  const { gesture, onAction, keys } = useScrub(frame, segments, current, set);
  const box = { height: frame.height };
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="adjustable"
        {...keys}
        accessibilityActions={ACTIONS}
        onAccessibilityAction={onAction}
        {...readingOf(segments, label, current)}
        style={box}
        className="relative w-full"
      >
        <Plot
          frame={frame}
          segments={segments}
          compact={compact}
          active={current === null ? null : spanAt(segments, current)}
        />
        {markers ? <Markers frame={frame} compact={compact} /> : null}
        {current === null ? null : <Cursor segments={segments} frame={frame} at={current} />}
      </View>
    </GestureDetector>
  );
}

function GhostChart({
  frame,
  label,
}: {
  readonly frame: HypnogramFrame;
  readonly label: string;
}): ReactNode {
  const box = { height: frame.height };
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={summaryOf([], label)}
      style={box}
      className="relative w-full"
    >
      <View pointerEvents="none" className="absolute inset-0">
        <Svg width={frame.width} height={frame.height}>
          <Guides frame={frame} ticks={[]} lanes vertical={false} />
          <Ghost frame={frame} />
        </Svg>
      </View>
    </View>
  );
}

function defaultHeight(compact: boolean, pointer: boolean): number {
  if (compact) {
    return HEIGHT_COMPACT;
  }
  return pointer ? HEIGHT_DESKTOP : HEIGHT_PHONE;
}

function windowFor(props: HypnogramProps): NightWindow {
  const given = {
    ...(props.from === undefined ? {} : { from: props.from }),
    ...(props.to === undefined ? {} : { to: props.to }),
  };
  const times = props.segments.flatMap((segment) => [segment.start, segment.end]);
  return nightWindow(times, given) ?? { from: 0, to: 1 };
}

export const Hypnogram = memo(function Hypnogram(props: HypnogramProps): ReactNode {
  const { compact = false, markers = true, at, onAt } = props;
  const { width, onLayout } = useMeasuredWidth();
  const pointer = useIdiom() === 'pointer';
  const [own, setOwn] = useState<number | null>(null);
  const empty = props.segments.length === 0;
  const frame = frameOf({
    window: windowFor(props),
    width,
    height: props.height ?? defaultHeight(compact, pointer),
    compact,
    markers: markers && !empty,
  });
  const set = (value: number | null): void => {
    setOwn(value);
    onAt?.(value);
  };
  const box = { height: frame.height };
  return (
    <View style={box} className="w-full" onLayout={onLayout}>
      {width === 0 ? null : empty ? (
        <GhostChart frame={frame} label={props.label} />
      ) : (
        <Chart {...props} frame={frame} current={at === undefined ? own : at} set={set} />
      )}
    </View>
  );
});
