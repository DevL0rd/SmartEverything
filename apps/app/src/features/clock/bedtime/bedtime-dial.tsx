import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { angleAt } from '../../../components/charts/arc';
import { arcPath, pointOn, type Ring } from '../../../components/charts/geometry';
import { Figure } from '../../../components/figure';
import { Icon, type IconName } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { useColour } from '../../../design/colour';
import { useClockFormat } from '../../../store/clock-format';
import { selectionTick } from '../../../platform/haptics';
import {
  angleOfMinute,
  dialSpokenOf,
  dialTicks,
  minuteOfAngle,
  movedTimes,
  nearestHandle,
  sleepArcOf,
  sleepLengthText,
  sleepMinutesOf,
  windDownArcOf,
  type DialArc,
  type DialHandle,
  type DialTimes,
} from './dial-model';

export interface BedtimeDialProps {
  readonly times: DialTimes;
  readonly windDown: number | null;
  readonly size: number;
  readonly draggable: boolean;
  readonly disabled: boolean;
  readonly onCommit: (times: DialTimes) => void;
  readonly onEdit: () => void;
}

interface Geometry {
  readonly size: number;
  readonly thickness: number;
  readonly ring: Ring;
}

function geometryOf(size: number): Geometry {
  const thickness = Math.round(size / 9);
  const half = size / 2;
  return { size, thickness, ring: { cx: half, cy: half, r: half - thickness / 2 - 2 } };
}

function ArcBand({
  arc,
  geometry,
  colour,
  opacity,
}: {
  readonly arc: DialArc;
  readonly geometry: Geometry;
  readonly colour: string;
  readonly opacity: number;
}): ReactNode {
  return (
    <Path
      d={arcPath(geometry.ring, arc.start, arc.start + arc.sweep)}
      fill="none"
      stroke={colour}
      strokeOpacity={opacity}
      strokeWidth={geometry.thickness}
      strokeLinecap="round"
    />
  );
}

function innerRingOf(geometry: Geometry): Ring {
  return { ...geometry.ring, r: geometry.ring.r - geometry.thickness / 2 - 4 };
}

const LABEL_BOX = { width: 24, height: 16 };

const PERIOD_LABEL_BOX = { width: 44, height: 16 };

function HourLabels({ geometry }: { readonly geometry: Geometry }): ReactNode {
  const format = useClockFormat();
  const box = format.hour24 ? LABEL_BOX : PERIOD_LABEL_BOX;
  const text = { ...innerRingOf(geometry), r: innerRingOf(geometry).r - 14 };
  return dialTicks(format).map((entry) => {
    if (entry.label === null) return null;
    const at = pointOn(text, entry.angle);
    const place = {
      left: at.x - box.width / 2,
      top: at.y - box.height / 2,
      width: box.width,
    };
    return (
      <View key={entry.minute} pointerEvents="none" className="absolute items-center" style={place}>
        <Text variant="caption" tone="variant" className="tabular">
          {entry.label}
        </Text>
      </View>
    );
  });
}

function Ticks({ geometry }: { readonly geometry: Geometry }): ReactNode {
  const tick = useColour('outline');
  const format = useClockFormat();
  const inner = innerRingOf(geometry);
  return (
    <G>
      {dialTicks(format).map((entry) => {
        const major = entry.label !== null;
        const from = pointOn(inner, entry.angle);
        const to = pointOn({ ...inner, r: inner.r - (major ? 6 : 3) }, entry.angle);
        return (
          <Line
            key={entry.minute}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
            stroke={tick}
            strokeWidth={major ? 2 : 1}
          />
        );
      })}
    </G>
  );
}

function HandleDiscs({
  geometry,
  times,
  active,
}: {
  readonly geometry: Geometry;
  readonly times: DialTimes;
  readonly active: DialHandle | null;
}): ReactNode {
  const fill = useColour('sleep-deep');
  const ring = useColour('surface-1');
  return (
    <G>
      {(['bed', 'wake'] as const).map((handle) => {
        const at = pointOn(geometry.ring, angleOfMinute(times[handle]));
        const radius = geometry.thickness / 2 + (active === handle ? 4 : 1);
        return (
          <Circle
            key={handle}
            cx={at.x}
            cy={at.y}
            r={radius}
            fill={fill}
            stroke={ring}
            strokeWidth={2}
          />
        );
      })}
    </G>
  );
}

function HandleIcon({
  geometry,
  minute,
  icon,
}: {
  readonly geometry: Geometry;
  readonly minute: number;
  readonly icon: IconName;
}): ReactNode {
  const at = pointOn(geometry.ring, angleOfMinute(minute));
  const place = { left: at.x - 9, top: at.y - 9 };
  return (
    <View pointerEvents="none" className="absolute" style={place}>
      <Icon name={icon} size={18} colour="on-surface" />
    </View>
  );
}

function DialFace({
  times,
  windDown,
  geometry,
  active,
}: {
  readonly times: DialTimes;
  readonly windDown: number | null;
  readonly geometry: Geometry;
  readonly active: DialHandle | null;
}): ReactNode {
  const track = useColour('surface-3');
  const sleep = useColour('sleep-core');
  const wind = useColour('sleep-rem');
  const windArc = windDownArcOf(times, windDown);
  return (
    <Svg width={geometry.size} height={geometry.size}>
      <Circle
        cx={geometry.ring.cx}
        cy={geometry.ring.cy}
        r={geometry.ring.r}
        fill="none"
        stroke={track}
        strokeWidth={geometry.thickness}
      />
      {windArc === null ? null : (
        <ArcBand arc={windArc} geometry={geometry} colour={wind} opacity={0.45} />
      )}
      <ArcBand arc={sleepArcOf(times)} geometry={geometry} colour={sleep} opacity={1} />
      <Ticks geometry={geometry} />
      <HandleDiscs geometry={geometry} times={times} active={active} />
    </Svg>
  );
}

function DialCentre({
  times,
  small,
}: {
  readonly times: DialTimes;
  readonly small: boolean;
}): ReactNode {
  const format = useClockFormat();
  return (
    <View pointerEvents="none" className="items-center gap-0.5">
      <Text variant="caption" tone="variant">
        In bed
      </Text>
      <Figure value={sleepLengthText(sleepMinutesOf(times))} size={small ? 's' : 'm'} />
      <Text variant="footnote" tone="variant" className="tabular">
        {`${format.minutes(times.bed)} – ${format.minutes(times.wake)}`}
      </Text>
    </View>
  );
}

interface DialDrag {
  readonly handle: DialHandle;
  readonly times: DialTimes;
}

function useDialDrag(
  props: BedtimeDialProps,
  geometry: Geometry,
  drag: DialDrag | null,
  set: (state: DialDrag | null) => void,
): ReturnType<typeof Gesture.Pan> {
  const at = (point: { readonly x: number; readonly y: number }): number =>
    minuteOfAngle(angleAt(geometry.size / 2, point));
  const handleAt = (point: { readonly x: number; readonly y: number }): DialHandle =>
    drag?.handle ?? nearestHandle(props.times, angleAt(geometry.size / 2, point));
  return Gesture.Pan()
    .runOnJS(true)
    .minDistance(0)
    .enabled(props.draggable && !props.disabled)
    .onBegin((point) => {
      const handle = nearestHandle(props.times, angleAt(geometry.size / 2, point));
      set({ handle, times: movedTimes(props.times, handle, at(point)) });
    })
    .onUpdate((point) => {
      const handle = handleAt(point);
      set({ handle, times: movedTimes(props.times, handle, at(point)) });
    })
    .onFinalize((point) => {
      const next = movedTimes(props.times, handleAt(point), at(point));
      set(null);
      if (next.bed !== props.times.bed || next.wake !== props.times.wake) {
        selectionTick();
        props.onCommit(next);
      }
    });
}

export function BedtimeDial(props: BedtimeDialProps): ReactNode {
  const geometry = geometryOf(props.size);
  const [drag, setDrag] = useState<DialDrag | null>(null);
  const shown = drag?.times ?? props.times;
  const pan = useDialDrag(props, geometry, drag, setDrag);
  const format = useClockFormat();
  const box = { width: props.size, height: props.size };
  const face = (
    <View style={box} className="items-center justify-center">
      <View className="absolute inset-0">
        <DialFace
          times={shown}
          windDown={props.windDown}
          geometry={geometry}
          active={drag?.handle ?? null}
        />
      </View>
      <HourLabels geometry={geometry} />
      <HandleIcon geometry={geometry} minute={shown.bed} icon="moon" />
      <HandleIcon geometry={geometry} minute={shown.wake} icon="sun" />
      <DialCentre times={shown} small={props.size < 260} />
    </View>
  );
  if (props.draggable) {
    return (
      <GestureDetector gesture={pan}>
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel={`${dialSpokenOf(shown, format)}. Drag the moon or the sun to change it.`}
          accessibilityState={{ disabled: props.disabled }}
          className={props.disabled ? 'opacity-40' : 'cursor-pointer'}
        >
          {face}
        </View>
      </GestureDetector>
    );
  }
  return (
    <Interactive
      label={`${dialSpokenOf(shown, format)}. Change the times`}
      disabled={props.disabled}
      onPress={props.onEdit}
      layerClassName="rounded-full"
    >
      {face}
    </Interactive>
  );
}
