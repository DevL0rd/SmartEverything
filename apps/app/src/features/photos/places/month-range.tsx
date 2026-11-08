import { useState, type ReactNode } from 'react';
import { View, type AccessibilityActionEvent, type ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, { useAnimatedStyle, useSharedValue } from 'react-native-reanimated';
import { scheduleOnRN } from 'react-native-worklets';
import Svg, { Path } from 'react-native-svg';
import type { TimelineBucket } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import {
  fullRange,
  indexAt,
  isFull,
  monthLabel,
  rangeLabel,
  shareOf,
  withEnd,
  withStart,
  yearTicks,
  type MonthRange,
} from './time-range';

const HEIGHT = 64;
const BAR_SHARE = 0.75;
const TICK_SPACING = 48;
const HANDLE_TARGET = 44;
const ADJUST = [
  { name: 'increment', label: 'Later' },
  { name: 'decrement', label: 'Earlier' },
] as const;

export interface MonthRangeProps {
  readonly months: readonly TimelineBucket[];
  readonly range: MonthRange;
  readonly onRange: (range: MonthRange) => void;
}

export function barPath(x: number, width: number, height: number): string {
  const top = HEIGHT - height;
  return `M${String(x)} ${String(HEIGHT)}V${String(top)}H${String(x + width)}V${String(HEIGHT)}Z`;
}

function handleAt(left: number): ViewStyle {
  return { left: left - HANDLE_TARGET / 2, width: HANDLE_TARGET };
}

function tickAt(share: number, width: number): ViewStyle {
  return { left: Math.min(share * width, width - TICK_SPACING) };
}

function Histogram({
  months,
  range,
  width,
}: MonthRangeProps & { readonly width: number }): ReactNode {
  const on = useColour('viz-1');
  const off = useColour('outline-variant');
  const peak = months.reduce((top, bucket) => Math.max(top, bucket.count), 0);
  const slot = months.length > 0 ? width / months.length : 0;
  return (
    <Svg width={width} height={HEIGHT}>
      {months.map((bucket, index) => {
        const height = peak > 0 ? Math.max(2, (bucket.count / peak) * HEIGHT) : 0;
        const shown = index >= range.start && index <= range.end;
        return (
          <Path
            key={bucket.month}
            d={barPath(index * slot, Math.max(1, slot * BAR_SHARE), height)}
            fill={shown ? on : off}
          />
        );
      })}
    </Svg>
  );
}

interface HandleProps {
  readonly side: 'start' | 'end';
  readonly slider: MonthRangeProps;
  readonly width: number;
}

function moveTo(slider: MonthRangeProps, side: HandleProps['side'], index: number): void {
  slider.onRange(side === 'start' ? withStart(slider.range, index) : withEnd(slider.range, index));
}

function Handle({ side, slider, width }: HandleProps): ReactNode {
  const index = side === 'start' ? slider.range.start : slider.range.end;
  const total = slider.months.length;
  const left = shareOf(index, total) * width;
  const dx = useSharedValue(0);
  const commit = (shift: number): void => {
    dx.set(0);
    moveTo(slider, side, indexAt((left + shift) / Math.max(1, width), total));
  };
  const drag = Gesture.Pan()
    .onUpdate((event) => {
      dx.set(event.translationX);
    })
    .onEnd((event) => {
      scheduleOnRN(commit, event.translationX);
    });
  const moved = useAnimatedStyle(() => ({ transform: [{ translateX: dx.get() }] }));
  const month = slider.months[index]?.month;
  return (
    <GestureDetector gesture={drag}>
      <Animated.View
        accessible
        accessibilityRole="adjustable"
        accessibilityLabel={side === 'start' ? 'From' : 'To'}
        accessibilityValue={{ text: month === undefined ? '' : monthLabel(month) }}
        accessibilityActions={ADJUST}
        onAccessibilityAction={(event: AccessibilityActionEvent) => {
          moveTo(slider, side, index + (event.nativeEvent.actionName === 'increment' ? 1 : -1));
        }}
        style={[handleAt(left), moved]}
        className="absolute -bottom-1 -top-1 items-center"
      >
        <View className="h-full w-0.75 rounded-full bg-primary" />
      </Animated.View>
    </GestureDetector>
  );
}

function Ticks({
  months,
  width,
}: {
  readonly months: readonly TimelineBucket[];
  readonly width: number;
}): ReactNode {
  return (
    <View className="h-4">
      {yearTicks(months, width, TICK_SPACING).map((tick) => (
        <View key={tick.year} className="absolute" style={tickAt(tick.share, width)}>
          <Text variant="caption" tone="variant" className="tabular-nums">
            {tick.year}
          </Text>
        </View>
      ))}
    </View>
  );
}

export function MonthRangeCard(props: MonthRangeProps): ReactNode {
  const [width, setWidth] = useState(0);
  const label = rangeLabel(props.range, props.months);
  return (
    <Card
      title="Time range"
      action={
        isFull(props.range, props.months) ? null : (
          <Button
            label="All time"
            variant="text"
            onPress={() => {
              props.onRange(fullRange(props.months));
            }}
          />
        )
      }
      metadata={
        label === null ? null : (
          <Text variant="footnote" tone="variant" className="tabular-nums">
            {label}
          </Text>
        )
      }
    >
      <View
        accessibilityLabel="Photos per month"
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
        }}
        className="gap-1"
      >
        <View className="h-16">
          {width > 0 ? <Histogram {...props} width={width} /> : null}
          {width > 0 ? <Handle side="start" slider={props} width={width} /> : null}
          {width > 0 ? <Handle side="end" slider={props} width={width} /> : null}
        </View>
        {width > 0 ? <Ticks months={props.months} width={width} /> : null}
      </View>
    </Card>
  );
}
