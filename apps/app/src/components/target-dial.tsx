import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle } from 'react-native-svg';
import { useColour } from '../design/colour';
import { useIdiom } from '../design/platform';
import type { ColourRole } from '../design/tokens';
import { withUnit } from '../format/number';
import { selectionTick } from '../platform/haptics';
import { Arc, angleAt, polar } from './charts/arc';
import { clamp, snap, type Extent } from './charts/scale';
import { Figure } from './figure';
import { stepFormat } from './number-stepper';
import { useFocusedKeys } from './focused-keys';
import { Text } from './text';

export interface TargetDialProps {
  readonly current: number | null;
  readonly target: number;
  readonly min: number;
  readonly max: number;
  readonly step: number;
  readonly unit: string;
  readonly label: string;
  readonly onCommit: (target: number) => void;
  readonly size?: number;
  readonly colour?: ColourRole;
  readonly formatValue?: (value: number) => string;
}

const START = -135;
const SWEEP = 270;

const KEY_STEPS: Readonly<Record<string, number>> = {
  ArrowRight: 1,
  ArrowUp: 1,
  ArrowLeft: -1,
  ArrowDown: -1,
};

function shareOf(value: number, bounds: Extent): number {
  return bounds.max > bounds.min
    ? (clamp(value, bounds) - bounds.min) / (bounds.max - bounds.min)
    : 0;
}

function valueAt(
  point: { readonly x: number; readonly y: number },
  size: number,
  props: TargetDialProps,
): number {
  const relative = (angleAt(size / 2, point) - START + 360) % 360;
  const gapMiddle = SWEEP + (360 - SWEEP) / 2;
  const along = relative <= SWEEP ? relative : relative > gapMiddle ? 0 : SWEEP;
  const bounds = { min: props.min, max: props.max };
  return snap(props.min + (along / SWEEP) * (props.max - props.min), bounds, props.step);
}

function Markers({
  size,
  thickness,
  share,
  current,
  colour,
}: {
  readonly size: number;
  readonly thickness: number;
  readonly share: number;
  readonly current: number | null;
  readonly colour: ColourRole;
}): ReactNode {
  const fill = useColour(colour);
  const ring = useColour('surface-1');
  const ink = useColour('on-surface');
  const radius = (size - thickness) / 2;
  const thumb = polar(size / 2, radius, START + share * SWEEP);
  const now = current === null ? null : polar(size / 2, radius, START + current * SWEEP);
  return (
    <View pointerEvents="none" className="absolute inset-0">
      <Svg width={size} height={size}>
        {now === null ? null : (
          <Circle cx={now.x} cy={now.y} r={Math.max(2, thickness / 5)} fill={ink} />
        )}
        <Circle
          cx={thumb.x}
          cy={thumb.y}
          r={Math.max(12, thickness * 0.8)}
          fill={fill}
          stroke={ring}
          strokeWidth={3}
        />
      </Svg>
    </View>
  );
}

function DialCentre({
  current,
  target,
  unit,
  format,
}: {
  readonly current: number | null;
  readonly target: number;
  readonly unit: string;
  readonly format: (value: number) => string;
}): ReactNode {
  return (
    <>
      {current === null ? (
        <Text variant="callout" tone="faint">
          No reading
        </Text>
      ) : (
        <Figure value={format(current)} unit={unit} size="l" />
      )}
      <Text variant="footnote" tone="variant" className="tabular">
        {`Target ${withUnit(format(target), unit)}`}
      </Text>
    </>
  );
}

function useDialDrag(
  props: TargetDialProps,
  size: number,
  setDragged: (value: number | null) => void,
): ReturnType<typeof Gesture.Pan> {
  const preview = (point: { readonly x: number; readonly y: number }): void => {
    setDragged(valueAt(point, size, props));
  };
  return Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .onBegin(preview)
    .onUpdate(preview)
    .onFinalize((point) => {
      const next = valueAt(point, size, props);
      setDragged(null);
      if (next !== props.target) {
        selectionTick();
        props.onCommit(next);
      }
    });
}

function useDialKeys(props: TargetDialProps): {
  nudge: (by: number) => boolean;
  focus: ReturnType<typeof useFocusedKeys>;
} {
  const pointer = useIdiom() === 'pointer';
  const nudge = (by: number): boolean => {
    const next = snap(props.target + by * props.step, props, props.step);
    if (next !== props.target) {
      props.onCommit(next);
    }
    return true;
  };
  const focus = useFocusedKeys(pointer, (key) => {
    const steps = KEY_STEPS[key];
    return steps === undefined ? false : nudge(steps);
  });
  return { nudge, focus };
}

export function TargetDial(props: TargetDialProps): ReactNode {
  const { current, target, min, max, step, unit, label, size = 220, colour = 'primary' } = props;
  const format = props.formatValue ?? stepFormat(step);
  const [dragged, setDragged] = useState<number | null>(null);
  const shown = dragged ?? target;
  const bounds = { min, max };
  const thickness = Math.round(size / 14);
  const pan = useDialDrag(props, size, setDragged);
  const { nudge, focus } = useDialKeys(props);
  const box = { width: size, height: size };
  return (
    <GestureDetector gesture={pan}>
      <View
        accessible
        focusable
        onFocus={focus.onFocus}
        onBlur={focus.onBlur}
        accessibilityRole="adjustable"
        accessibilityLabel={label}
        accessibilityValue={{ min, max, now: shown, text: withUnit(format(shown), unit) }}
        accessibilityActions={[{ name: 'increment' }, { name: 'decrement' }]}
        onAccessibilityAction={(event) => {
          nudge(event.nativeEvent.actionName === 'increment' ? 1 : -1);
        }}
        style={box}
        className="items-center justify-center rounded-full focus:outline-2 focus:outline-offset-2 focus:outline-focus"
      >
        <View className="absolute inset-0">
          <Arc
            value={shareOf(shown, bounds)}
            size={size}
            thickness={thickness}
            colour={colour}
            startAngle={START}
            sweep={SWEEP}
          />
        </View>
        <Markers
          size={size}
          thickness={thickness}
          share={shareOf(shown, bounds)}
          current={current === null ? null : shareOf(current, bounds)}
          colour={colour}
        />
        <DialCentre current={current} target={shown} unit={unit} format={format} />
      </View>
    </GestureDetector>
  );
}
