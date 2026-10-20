import type { ReactNode } from 'react';
import { View } from 'react-native';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { clock } from '../../format/time';
import { Text } from '../text';
import { barPath } from './bar-path';
import { Crosshair, Readout, type ScrubModel } from './chart-parts';
import { nightX } from './night-axis';
import {
  lowestOf,
  readoutTextOf,
  ringedOf,
  gutterFormatterOf,
  gutterValuesOf,
  linePathOf,
  valueAt,
  valueY,
  type TraceFrame,
  type TracePoint,
} from './night-trace-model';

const PANEL_OPACITY = 0.55;
const GUIDE_OPACITY = 0.3;
const SAMPLE_R = 2.4;
const MARK_R = 4.5;
const RING_R = 7;
const PANEL_RADIUS = 6;

export interface Marks {
  readonly visible: readonly TracePoint[];
  readonly format: (value: number) => string;
}

function Panel({ frame }: { readonly frame: TraceFrame }): ReactNode {
  const fill = useColour('surface-2');
  return (
    <Path
      d={barPath(
        {
          x: frame.left,
          width: Math.max(1, frame.right - frame.left),
          top: 0,
          bottom: frame.height,
        },
        { top: PANEL_RADIUS, bottom: PANEL_RADIUS },
      )}
      fill={fill}
      fillOpacity={PANEL_OPACITY}
    />
  );
}

function GuideLine({
  frame,
  guide,
}: {
  readonly frame: TraceFrame;
  readonly guide: number;
}): ReactNode {
  const stroke = useColour('on-surface-variant');
  return (
    <Line
      x1={frame.left}
      x2={frame.right}
      y1={valueY(frame, guide)}
      y2={valueY(frame, guide)}
      stroke={stroke}
      strokeOpacity={GUIDE_OPACITY}
      strokeWidth={1}
      strokeDasharray="4 4"
    />
  );
}

function Samples({
  frame,
  visible,
  ringBelow,
  dots,
}: {
  readonly frame: TraceFrame;
  readonly visible: readonly TracePoint[];
  readonly ringBelow: number | undefined;
  readonly dots: boolean;
}): ReactNode {
  const ink = useColour('on-surface-variant');
  const strong = useColour('on-surface');
  const rung = ringBelow === undefined ? [] : ringedOf(visible, ringBelow);
  return (
    <G>
      {dots
        ? visible.map((point) => (
            <Circle
              key={point.at}
              cx={nightX(frame, point.at)}
              cy={valueY(frame, point.value)}
              r={SAMPLE_R}
              fill={ink}
            />
          ))
        : null}
      {rung.map((point) => (
        <Circle
          key={point.at}
          cx={nightX(frame, point.at)}
          cy={valueY(frame, point.value)}
          r={RING_R}
          fill="none"
          stroke={strong}
          strokeWidth={2}
        />
      ))}
    </G>
  );
}

function LowDot({
  frame,
  point,
}: {
  readonly frame: TraceFrame;
  readonly point: TracePoint;
}): ReactNode {
  const fill = useColour('on-surface');
  const ring = useColour('surface-1');
  return (
    <Circle
      cx={nightX(frame, point.at)}
      cy={valueY(frame, point.value)}
      r={MARK_R}
      fill={fill}
      stroke={ring}
      strokeWidth={2}
    />
  );
}

export function Plot({
  frame,
  visible,
  guide,
  lowMark,
  ringBelow,
  dots,
}: {
  readonly frame: TraceFrame;
  readonly visible: readonly TracePoint[];
  readonly guide: number | undefined;
  readonly lowMark: boolean;
  readonly ringBelow: number | undefined;
  readonly dots: boolean;
}): ReactNode {
  const ink = useColour('on-surface-variant');
  const lowest = lowMark ? lowestOf(visible) : null;
  return (
    <G>
      <Panel frame={frame} />
      {guide === undefined ? null : <GuideLine frame={frame} guide={guide} />}
      <Path
        d={linePathOf(visible, frame)}
        fill="none"
        stroke={ink}
        strokeWidth={2}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      <Samples frame={frame} visible={visible} ringBelow={ringBelow} dots={dots} />
      {lowest === null ? null : <LowDot frame={frame} point={lowest} />}
    </G>
  );
}

export function GutterLabels({
  frame,
  guide,
}: {
  readonly frame: TraceFrame;
  readonly guide: number | undefined;
}): ReactNode {
  const format = gutterFormatterOf(frame.domain);
  return (
    <>
      {gutterValuesOf(frame.domain, guide).map((value) => {
        const place = { top: valueY(frame, value) - 8, width: frame.left - 6 };
        return (
          <View key={value} pointerEvents="none" style={place} className="absolute left-0">
            <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
              {format(value)}
            </Text>
          </View>
        );
      })}
    </>
  );
}

function scrubModelOf(frame: TraceFrame): ScrubModel {
  return {
    box: {
      width: frame.width,
      height: frame.height,
      left: frame.left,
      right: frame.right,
      top: 0,
      bottom: frame.height,
    },
    x: (at) => nightX(frame, at),
  };
}

export function Cursor({
  frame,
  visible,
  label,
  at,
  format,
}: {
  readonly frame: TraceFrame;
  readonly label: string;
  readonly at: number;
} & Marks): ReactNode {
  const dot = useColour('on-surface');
  const ring = useColour('surface-1');
  const sample = valueAt(visible, at);
  const hit = {
    series: { points: [], colour: 'on-surface-variant' as const, label },
    point: { t: at, v: sample?.value ?? 0 },
  };
  const model = scrubModelOf(frame);
  return (
    <>
      <View pointerEvents="none" className="absolute inset-0">
        <Svg width={frame.width} height={frame.height}>
          <Crosshair hits={[hit]} model={model} />
          {sample === null ? null : (
            <Circle
              cx={nightX(frame, at)}
              cy={valueY(frame, sample.value)}
              r={MARK_R}
              fill={dot}
              stroke={ring}
              strokeWidth={2}
            />
          )}
        </Svg>
      </View>
      <Readout
        hits={[hit]}
        model={model}
        heading={clock(at)}
        valueOf={() => readoutTextOf(sample, format)}
      />
    </>
  );
}
