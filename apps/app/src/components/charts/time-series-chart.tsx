import type { ReactNode } from 'react';
import { useState } from 'react';
import { View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Svg, { Circle, G, Line, Path } from 'react-native-svg';
import { useColour } from '../../design/colour';
import { useIdiom } from '../../design/platform';
import { withUnit } from '../../format/number';
import { selectionTick } from '../../platform/haptics';
import { Icon } from '../icon';
import { Text } from '../text';
import { Axes, Extremes, MarkerLabel, MarkerLine } from './chart-labels';
import {
  LONG_PRESS_MS,
  READOUT_W,
  modelOf,
  type ChartSeries,
  type Model,
  type TimeSeriesChartProps,
} from './chart-model';
import {
  clamp,
  extremaOf,
  hitsAt,
  linePath,
  pointLabel,
  type ChartPoint,
  type ChartRange,
  type Drawn,
  type Hit,
} from './scale';

export type { ChartMarker, ChartSeries, TimeSeriesChartProps } from './chart-model';

function Grid({ model }: { readonly model: Model }): ReactNode {
  const stroke = useColour('outline-variant');
  return (
    <G>
      {model.yTicks.map((tick) => (
        <Line
          key={tick}
          x1={model.box.left}
          x2={model.box.right}
          y1={model.y(tick)}
          y2={model.y(tick)}
          stroke={stroke}
          strokeWidth={1}
        />
      ))}
    </G>
  );
}

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

function Crosshair({
  hits,
  model,
}: {
  readonly hits: readonly Hit<ChartSeries>[];
  readonly model: Model;
}): ReactNode {
  const stroke = useColour('on-surface-variant');
  const at = hits[0] === undefined ? null : model.x(hits[0].point.t);
  return (
    <G>
      {at === null ? null : (
        <Line
          x1={at}
          x2={at}
          y1={model.box.top}
          y2={model.box.bottom}
          stroke={stroke}
          strokeWidth={1}
        />
      )}
    </G>
  );
}

function Readout({
  hits,
  model,
  range,
}: {
  readonly hits: readonly Hit<ChartSeries>[];
  readonly model: Model;
  readonly range: ChartRange;
}): ReactNode {
  const first = hits[0];
  if (first === undefined) {
    return null;
  }
  const at = model.x(first.point.t);
  const left = at > (model.box.left + model.box.right) / 2 ? at - 12 - READOUT_W : at + 12;
  const place = {
    left: clamp(left, { min: 0, max: model.box.width - READOUT_W }),
    top: model.box.top,
  };
  return (
    <View
      pointerEvents="none"
      style={place}
      className="absolute w-36 gap-0.5 rounded-sm border border-outline-variant bg-surface-raised px-2 py-1.5 elevation-2"
    >
      <Text variant="caption" tone="variant" className="tabular">
        {pointLabel(first.point.t, range)}
      </Text>
      {hits.map((hit) => (
        <View key={hit.series.label} className="flex-row items-center gap-1.5">
          <Icon name="circle" size={16} colour={hit.series.colour} />
          <Text variant="caption" numberOfLines={1} className="flex-1">
            {hit.series.label}
          </Text>
          <Text variant="caption" className="tabular">
            {withUnit(model.format(hit.point.v), model.unit)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function summaryOf(props: TimeSeriesChartProps, model: Model | null): string {
  if (model === null) {
    return `${props.series.map((series) => series.label).join(', ')}: no readings in this range`;
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

function scrubGesture(
  pointer: boolean,
  setX: (x: number | null) => void,
): ReturnType<typeof Gesture.Hover> | ReturnType<typeof Gesture.Pan> {
  const clear = (): void => {
    setX(null);
  };
  if (pointer) {
    return Gesture.Hover()
      .runOnJS(true)
      .onBegin((event) => {
        setX(event.x);
      })
      .onUpdate((event) => {
        setX(event.x);
      })
      .onFinalize(clear);
  }
  return Gesture.Pan()
    .runOnJS(true)
    .activateAfterLongPress(LONG_PRESS_MS)
    .onStart((event) => {
      selectionTick();
      setX(event.x);
    })
    .onUpdate((event) => {
      setX(event.x);
    })
    .onFinalize(clear);
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
      <Readout hits={hits} model={model} range={range} />
    </>
  );
}

export function TimeSeriesChart(props: TimeSeriesChartProps): ReactNode {
  const { height = 200, range } = props;
  const [width, setWidth] = useState(0);
  const [scrubX, setScrubX] = useState<number | null>(null);
  const pointer = useIdiom() === 'pointer';
  const model = width > 0 ? modelOf(props, width, height) : null;
  const box = { height };
  return (
    <GestureDetector gesture={scrubGesture(pointer, setScrubX)}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={summaryOf(props, model)}
        style={box}
        className="relative w-full"
        onLayout={(event) => {
          setWidth(event.nativeEvent.layout.width);
        }}
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
}
