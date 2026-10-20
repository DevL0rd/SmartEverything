import type { ReactNode } from 'react';
import { G, Line, Path, Text as SvgText } from 'react-native-svg';
import { useColour } from '../../../design/colour';
import { PlotFrame, plotX, plotY } from '../../toothbrush/charts/plot-frame';
import { daysSeriesLabel, type DaysSeries } from '../model/care-model';

function share(series: DaysSeries, at: number): number {
  return (at - series.fromMs) / Math.max(1, series.toMs - series.fromMs);
}

function lineOf(series: DaysSeries, width: number, peak: number): string {
  return series.points
    .map((point, index) => {
      const x = plotX(share(series, point.at), width);
      const y = plotY(point.days / peak);
      return `${index === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`;
    })
    .join(' ');
}

function Resets({
  series,
  width,
}: {
  readonly series: DaysSeries;
  readonly width: number;
}): ReactNode {
  const mark = useColour('on-surface-variant');
  return series.resets.map((at) => {
    const x = plotX(share(series, at), width);
    return (
      <G key={at}>
        <Line
          x1={x}
          x2={x}
          y1={plotY(1)}
          y2={plotY(0)}
          stroke={mark}
          strokeWidth={1}
          strokeDasharray="3 3"
        />
        <SvgText
          transform={[{ translateX: x + 4 }, { translateY: plotY(1) + 9 }]}
          fontSize={10}
          fill={mark}
        >
          new head
        </SvgText>
      </G>
    );
  });
}

export function DaysLine({ series }: { readonly series: DaysSeries | null }): ReactNode {
  const curve = useColour('primary');
  const grid = useColour('outline-variant');
  if (series === null) {
    return null;
  }
  const peak = Math.max(1, ...series.points.map((point) => point.days));
  return (
    <PlotFrame
      label={daysSeriesLabel(series)}
      note="Days left on the head. A new head starts where the line jumps back up."
    >
      {(width) => (
        <>
          <Line x1={0} x2={width} y1={plotY(0)} y2={plotY(0)} stroke={grid} strokeWidth={1} />
          <Resets series={series} width={width} />
          <Path
            d={lineOf(series, width, peak)}
            fill="none"
            stroke={curve}
            strokeWidth={2.2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        </>
      )}
    </PlotFrame>
  );
}
