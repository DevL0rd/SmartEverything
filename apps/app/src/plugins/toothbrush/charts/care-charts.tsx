import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Circle, Line, Path } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import {
  PLOT_HEIGHT,
  PLOT_PAD,
  batteryPath,
  type BatteryPlot,
  type ForecastLine,
  type TimelineBar,
} from '../model/care-model';
import { PlotFrame, plotX, plotY } from './plot-frame';
import { flexStyle } from './style';

export function WearForecast({
  line,
  label,
}: {
  readonly line: ForecastLine;
  readonly label: string;
}): ReactNode {
  const curve = useColour('primary');
  const warn = useColour('warning');
  const grid = useColour('outline-variant');
  const days = Math.max(1, line.to.x);
  return (
    <PlotFrame
      label={label}
      note="Dashed line: the wear at today’s pace. Amber dashes: when a warning comes."
    >
      {(width) => (
        <>
          <Line x1={0} x2={width} y1={plotY(1)} y2={plotY(1)} stroke={grid} strokeWidth={1} />
          <Line
            x1={0}
            x2={width}
            y1={plotY(line.warnY)}
            y2={plotY(line.warnY)}
            stroke={warn}
            strokeWidth={1.2}
            strokeDasharray="4 3"
          />
          <Path
            d={`M${plotX(0, width).toFixed(1)} ${plotY(line.from.y).toFixed(1)} L${plotX(line.to.x / days, width).toFixed(1)} ${plotY(line.to.y).toFixed(1)}`}
            stroke={curve}
            strokeWidth={2.2}
            strokeDasharray="6 4"
            strokeLinecap="round"
            fill="none"
          />
          <Circle cx={plotX(0, width)} cy={plotY(line.from.y)} r={4} fill={curve} />
        </>
      )}
    </PlotFrame>
  );
}

function ChargeTicks({
  charges,
  width,
}: {
  readonly charges: readonly number[];
  readonly width: number;
}): ReactNode {
  const charge = useColour('info');
  return charges.map((x) => (
    <Line
      key={x}
      x1={plotX(x, width)}
      x2={plotX(x, width)}
      y1={PLOT_PAD}
      y2={PLOT_HEIGHT - PLOT_PAD}
      stroke={charge}
      strokeWidth={1}
      strokeDasharray="2 3"
    />
  ));
}

export function BatteryCurve({
  plot,
  label,
}: {
  readonly plot: BatteryPlot;
  readonly label: string;
}): ReactNode {
  const line = useColour('positive');
  const low = useColour('critical');
  const grid = useColour('outline-variant');
  return (
    <PlotFrame
      label={label}
      note="Green line: the charge. Blue ticks: the brush was charged. Red dashes: the low battery level."
    >
      {(width) => (
        <>
          <Line x1={0} x2={width} y1={plotY(1)} y2={plotY(1)} stroke={grid} strokeWidth={1} />
          <Line
            x1={0}
            x2={width}
            y1={plotY(plot.low)}
            y2={plotY(plot.low)}
            stroke={low}
            strokeWidth={1.2}
            strokeDasharray="4 3"
          />
          <ChargeTicks charges={plot.charges} width={width} />
          <Path
            d={batteryPath(plot, width)}
            stroke={line}
            strokeWidth={2}
            fill="none"
            strokeLinejoin="round"
          />
        </>
      )}
    </PlotFrame>
  );
}

export function Scatter({
  points,
  label,
}: {
  readonly points: readonly { readonly x: number; readonly y: number }[];
  readonly label: string;
}): ReactNode {
  const dot = useColour('viz-blue');
  const grid = useColour('outline-variant');
  return (
    <PlotFrame
      label={label}
      note="Voltage against charge. A cell that ages sits lower for the same charge."
    >
      {(width) => (
        <>
          <Line
            x1={0}
            x2={width}
            y1={PLOT_HEIGHT - 0.5}
            y2={PLOT_HEIGHT - 0.5}
            stroke={grid}
            strokeWidth={1}
          />
          {points.map((point, index) => (
            <Circle
              key={index}
              cx={plotX(point.x, width)}
              cy={plotY(point.y)}
              r={2.6}
              fill={dot}
              fillOpacity={0.8}
            />
          ))}
        </>
      )}
    </PlotFrame>
  );
}

export function TimelineStrip({ bars }: { readonly bars: readonly TimelineBar[] }): ReactNode {
  const used = useColour('primary');
  const current = useColour('positive');
  return (
    <View className="gap-1.5">
      {bars.map((bar) => (
        <View
          key={bar.serial}
          accessible
          accessibilityLabel={bar.label}
          className="h-3 flex-row overflow-hidden rounded-full bg-surface-2"
        >
          <View style={flexStyle(bar.share, bar.current ? current : used)} />
          <View style={flexStyle(Math.max(0, 1 - bar.share))} />
        </View>
      ))}
    </View>
  );
}

const MIN_BAR = 0.06;

export function WeekBars({
  bars,
  label,
}: {
  readonly bars: readonly { readonly label: string; readonly value: number }[];
  readonly label: string;
}): ReactNode {
  const fill = useColour('viz-1');
  const peak = Math.max(1, ...bars.map((bar) => bar.value));
  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={label}
      className="h-20 flex-row items-end gap-1"
    >
      {bars.map((bar) => {
        const ratio = Math.max(MIN_BAR, bar.value / peak);
        return (
          <View key={bar.label} className="h-full flex-1">
            <View style={flexStyle(1 - ratio)} />
            <View className="rounded-xs" style={flexStyle(ratio, fill)} />
          </View>
        );
      })}
    </View>
  );
}
