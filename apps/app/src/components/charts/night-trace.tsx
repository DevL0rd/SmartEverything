import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { View, type AccessibilityActionEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg from 'react-native-svg';
import { useIdiom } from '../../design/platform';
import { useMeasuredWidth } from '../use-measured-width';
import { scrubGesture } from './chart-parts';
import { useStepKeys, type StepKeys } from './use-step-keys';
import { nightAt, nightWindow, type NightWindow } from './night-axis';
import {
  TRACE_HEIGHT_DESKTOP,
  TRACE_HEIGHT_PHONE,
  domainOf,
  formatterOf,
  pointsIn,
  stepAt,
  summaryOf,
  traceFrameOf,
  valueAt,
  type TraceFrame,
  type TracePoint,
} from './night-trace-model';
import { Cursor, GutterLabels, Plot, type Marks } from './night-trace-parts';

export type { TracePoint } from './night-trace-model';

export interface NightTraceProps {
  readonly points: readonly TracePoint[];
  readonly label: string;
  readonly unit?: string;
  readonly domain?: readonly [number, number];
  readonly guide?: number;
  readonly lowMark?: boolean;
  readonly ringBelow?: number;
  readonly dots?: boolean;
  readonly format?: (value: number) => string;
  readonly height?: number;
  readonly at?: number | null;
  readonly onAt?: (at: number | null) => void;
  readonly from?: number;
  readonly to?: number;
}

const ACTIONS = [{ name: 'increment' }, { name: 'decrement' }];

function useScrub(
  frame: TraceFrame,
  visible: readonly TracePoint[],
  current: number | null,
  set: (at: number | null) => void,
): {
  readonly gesture: ReturnType<typeof scrubGesture> | ReturnType<typeof Gesture.Race>;
  readonly onAction: (event: AccessibilityActionEvent) => void;
  readonly keys: StepKeys;
} {
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
    set(stepAt(visible, current, direction));
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

interface ChartProps extends Omit<NightTraceProps, 'format'>, Marks {
  readonly frame: TraceFrame;
  readonly current: number | null;
  readonly set: (at: number | null) => void;
}

function Chart(props: ChartProps): ReactNode {
  const { frame, visible, format, current, set } = props;
  const { gesture, onAction, keys } = useScrub(frame, visible, current, set);
  const sample = current === null ? null : valueAt(visible, current);
  const box = { height: frame.height };
  return (
    <GestureDetector gesture={gesture}>
      <View
        accessible
        accessibilityRole="adjustable"
        {...keys}
        accessibilityActions={ACTIONS}
        onAccessibilityAction={onAction}
        accessibilityLabel={summaryOf(visible, props.label, format)}
        accessibilityHint="Swipe up or down to move through readings."
        {...(sample === null ? {} : { accessibilityValue: { text: format(sample.value) } })}
        style={box}
        className="relative w-full"
      >
        <View pointerEvents="none" className="absolute inset-0">
          <Svg width={frame.width} height={frame.height}>
            <Plot
              frame={frame}
              visible={visible}
              guide={props.guide}
              lowMark={props.lowMark === true}
              ringBelow={props.ringBelow}
              dots={props.dots === true}
            />
          </Svg>
        </View>
        <GutterLabels frame={frame} guide={props.guide} />
        {current === null ? null : (
          <Cursor
            frame={frame}
            visible={visible}
            label={props.label}
            at={current}
            format={format}
          />
        )}
      </View>
    </GestureDetector>
  );
}

function windowFor(props: NightTraceProps): NightWindow {
  const given = {
    ...(props.from === undefined ? {} : { from: props.from }),
    ...(props.to === undefined ? {} : { to: props.to }),
  };
  return (
    nightWindow(
      props.points.map((point) => point.at),
      given,
    ) ?? { from: 0, to: 1 }
  );
}

export const NightTrace = memo(function NightTrace(props: NightTraceProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const pointer = useIdiom() === 'pointer';
  const [own, setOwn] = useState<number | null>(null);
  const window = windowFor(props);
  const visible = pointsIn(props.points, window);
  const domain = domainOf(visible, props.domain);
  const height = props.height ?? (pointer ? TRACE_HEIGHT_DESKTOP : TRACE_HEIGHT_PHONE);
  const frame = traceFrameOf({ window, width, height, domain });
  const format = props.format ?? formatterOf(domain, props.unit);
  const set = (value: number | null): void => {
    setOwn(value);
    props.onAt?.(value);
  };
  if (visible.length === 0) {
    return null;
  }
  const box = { height };
  return (
    <View style={box} className="w-full" onLayout={onLayout}>
      {width === 0 ? null : (
        <Chart
          {...props}
          frame={frame}
          visible={visible}
          format={format}
          current={props.at === undefined ? own : props.at}
          set={set}
        />
      )}
    </View>
  );
});
