import type { ReactNode } from 'react';
import { memo, useState } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, G, Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useIdiom } from '../../design/platform';
import { withUnit } from '../../format/number';
import { Text } from '../text';
import { useMeasuredWidth } from '../use-measured-width';
import { Axes, Extremes, MarkerLabel, MarkerLine } from './chart-labels';
import { LiveChart } from './live-chart';
import { Crosshair, Grid, Readout, scrubGesture } from './chart-parts';
import {
  modelOf,
  type ChartSeries,
  type Model,
  type StaticChartProps,
  type TimeSeriesChartProps,
} from './chart-model';
import {
  extremaOf,
  hitsAt,
  linePath,
  pointLabel,
  type ChartPoint,
  type ChartRange,
  type Drawn,
} from './scale';

export type { ChartSeries, TimeSeriesChartProps } from './chart-model';

const SeriesLines = memo(function SeriesLines({
  drawn,
  model,
}: {
  readonly drawn: Drawn<ChartSeries>;
  readonly model: Model;
}): ReactNode {
  const stroke = useColour(drawn.series.colour);
  return (
    <G>
      {drawn.segments.map((segment) => {
        const placed = segment.map((point) => ({ x: model.x(point.t), y: model.y(point.v) }));
        const [head] = placed;
        if (head === undefined) {
          return null;
        }
        return placed.length === 1 ? (
          <Circle key={head.x} cx={head.x} cy={head.y} r={1.5} fill={stroke} />
        ) : (
          <Path
            key={head.x}
            d={linePath(placed)}
            fill="none"
            stroke={stroke}
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        );
      })}
    </G>
  );
});

function SeriesLayer({
  drawn,
  model,
  focus,
}: {
  readonly drawn: Drawn<ChartSeries>;
  readonly model: Model;
  readonly focus: ChartPoint | null;
}): ReactNode {
  const stroke = useColour(drawn.series.colour);
  const ring = useColour('surface-1');
  const last = focus ?? drawn.points[drawn.points.length - 1];
  return (
    <G>
      <SeriesLines drawn={drawn} model={model} />
      {last === undefined ? null : (
        <Circle
          cx={model.x(last.t)}
          cy={model.y(last.v)}
          r={4}
          fill={stroke}
          stroke={ring}
          strokeWidth={2}
        />
      )}
    </G>
  );
}

function summaryOf(series: readonly ChartSeries[], model: Model | null): string {
  if (model === null) {
    return `${series.map((series) => series.label).join(', ')}: no readings in this range`;
  }
  return model.drawn
    .map((drawn) => {
      const extrema = extremaOf(drawn.points);
      const last = drawn.points[drawn.points.length - 1];
      if (extrema === null || last === undefined) {
        return `${drawn.series.label}: no readings`;
      }
      const say = (value: number): string => withUnit(model.format(value), model.unit);
      return `${drawn.series.label}: latest ${say(last.v)}, high ${say(extrema.peak.v)}, low ${say(extrema.low.v)}`;
    })
    .join('. ');
}

function Plot({
  model,
  scrubX,
  range,
}: {
  readonly model: Model;
  readonly scrubX: number | null;
  readonly range: ChartRange;
}): ReactNode {
  const hits = scrubX === null ? [] : hitsAt(model, scrubX);
  return (
    <>
      <View pointerEvents="none" className="absolute inset-0">
        <Svg width={model.box.width} height={model.box.height}>
          <Grid model={model} />
          <MarkerLine model={model} />
          {model.drawn.map((drawn) => (
            <SeriesLayer
              key={drawn.series.label}
              drawn={drawn}
              model={model}
              focus={hits.find((hit) => hit.series === drawn.series)?.point ?? null}
            />
          ))}
          {hits.length > 0 ? <Crosshair hits={hits} model={model} /> : null}
        </Svg>
      </View>
      <Axes model={model} />
      <MarkerLabel model={model} />
      {hits.length > 0 ? null : <Extremes model={model} />}
      <Readout
        hits={hits}
        model={model}
        heading={hits[0] === undefined ? '' : pointLabel(hits[0].point.t, range)}
        valueOf={(hit) => withUnit(model.format(hit.point.v), model.unit)}
      />
    </>
  );
}

const StaticChart = memo(function StaticChart(props: StaticChartProps): ReactNode {
  const { height = 200, range, series, unit, formatValue, fit, marker, yDomain, label } = props;
  const { width, onLayout } = useMeasuredWidth();
  const [scrubX, setScrubX] = useState<number | null>(null);
  const pointer = useIdiom() === 'pointer';
  const model =
    width > 0
      ? modelOf({ series, range, unit, formatValue, fit, marker, yDomain }, width, height)
      : null;
  const box = { height };
  return (
    <GestureDetector
      gesture={scrubGesture(pointer, (point) => {
        setScrubX(point === null ? null : point.x);
      })}
    >
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={
          label === undefined ? summaryOf(series, model) : `${label}. ${summaryOf(series, model)}`
        }
        style={box}
        className="relative w-full"
        onLayout={onLayout}
      >
        {model === null ? (
          <View className="flex-1 items-center justify-center">
            {width > 0 ? (
              <Text variant="footnote" tone="faint">
                No readings in this range
              </Text>
            ) : null}
          </View>
        ) : (
          <Plot model={model} scrubX={scrubX} range={range} />
        )}
      </View>
    </GestureDetector>
  );
});

export const TimeSeriesChart = memo(function TimeSeriesChart(
  props: TimeSeriesChartProps,
): ReactNode {
  return props.window === undefined ? <StaticChart {...props} /> : <LiveChart {...props} />;
});
