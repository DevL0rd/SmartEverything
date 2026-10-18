import type { ReactNode } from 'react';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import { useIdiom } from '../../design/platform';
import { useOnScreenGate } from '../../design/visibility';
import { withUnit } from '../../format/number';
import { Text } from '../text';
import { useMeasuredWidth } from '../use-measured-width';
import { Axes } from './chart-labels';
import { ChartLegend } from './chart-legend';
import { liveModelOf, type ChartSeries, type LiveChartProps, type Model } from './chart-model';
import { Readout, scrubGesture } from './chart-parts';
import { SlidingLines } from './live-lines';
import { Overlay } from './live-overlay';
import {
  EMPTY_STICKY,
  domainOf,
  liveLabel,
  liveSummary,
  liveWindowOf,
  nextSticky,
  peakOf,
  stacked,
  type LiveSummary,
  type StickyAxis,
} from './live-window';
import { hitsAt, type ChartPoint, type Hit } from './scale';

const DEFAULT_HEIGHT = 160;

function useStickyAxis(enabled: boolean, peak: number, now: number): StickyAxis {
  const [state, setState] = useState(EMPTY_STICKY);
  const next = enabled ? nextSticky(state, peak, now) : state;
  if (next !== state) {
    setState(next);
  }
  return next;
}

interface Lead {
  readonly label: string;
  readonly last: ChartPoint;
  readonly summary: LiveSummary;
}

function leadOf(model: Model, stack: boolean): Lead | null {
  const lead = stack ? model.drawn[model.drawn.length - 1] : model.drawn[0];
  const last = lead?.points[lead.points.length - 1];
  const summary = lead === undefined ? null : liveSummary(lead.points);
  return lead === undefined || last === undefined || summary === null
    ? null
    : { label: stack ? 'total' : lead.series.label, last, summary };
}

function sentenceOf(
  label: string,
  model: Model | null,
  series: readonly ChartSeries[],
  stack: boolean,
): string {
  const lead = model === null ? null : leadOf(model, stack);
  if (model === null || lead === null) {
    return `${label}: no readings`;
  }
  const say = (value: number): string => withUnit(model.format(value), model.unit);
  const others = (stack ? series : series.slice(1)).flatMap((entry) => {
    const end = entry.points[entry.points.length - 1];
    return end === undefined ? [] : [`${entry.label} ${say(end.v)}`];
  });
  const head = `${label}: ${lead.label} ${say(lead.last.v)} now, peak ${say(lead.summary.peak.v)} at ${liveLabel(lead.summary.peak.t)}, average ${say(lead.summary.average)}`;
  return others.length === 0 ? head : `${head}. ${others.join(', ')}`;
}

function Summary({ model, stack }: { readonly model: Model; readonly stack: boolean }): ReactNode {
  const lead = leadOf(model, stack);
  if (lead === null) {
    return null;
  }
  const say = (value: number): string => withUnit(model.format(value), model.unit);
  return (
    <Text variant="footnote" tone="variant" className="tabular">
      {`Peak ${say(lead.summary.peak.v)} at ${liveLabel(lead.summary.peak.t)} · Avg ${say(lead.summary.average)}`}
    </Text>
  );
}

interface LiveFrame {
  readonly model: Model | null;
  readonly area: boolean;
}

function useLiveFrame(props: LiveChartProps, width: number): LiveFrame {
  const { height = DEFAULT_HEIGHT, series, window, yDomain, unit, formatValue } = props;
  const stack = props.stack === true;
  const layers = stack ? stacked(series) : series.map((entry) => entry.points);
  const drawn = stack
    ? series.map((entry, index) => ({ ...entry, points: layers[index] ?? [] }))
    : series;
  const peak = peakOf(layers, liveWindowOf(window));
  const sticky = useStickyAxis(yDomain === 'sticky', peak, window.now);
  const domain = domainOf(yDomain, sticky, peak);
  const bare = props.bare === true;
  return {
    model:
      width > 0
        ? liveModelOf({ series: drawn, window, domain, unit, formatValue, bare }, width, height)
        : null,
    area: props.area ?? (stack || (series.length === 1 && domain.min === 0)),
  };
}

function LivePlot({
  chart,
  model,
  area,
  hits,
}: {
  readonly chart: Pick<LiveChartProps, 'series' | 'window' | 'stack' | 'nowRule' | 'bare'>;
  readonly model: Model;
  readonly area: boolean;
  readonly hits: readonly Hit<ChartSeries>[];
}): ReactNode {
  const stack = chart.stack === true;
  const bare = chart.bare === true;
  const root = useRef<View>(null);
  const gate = useOnScreenGate(root, true);
  return (
    <View ref={root} pointerEvents="box-none" className="absolute inset-0" onLayout={gate.onLayout}>
      <SlidingLines
        model={model}
        stack={stack}
        area={area}
        now={chart.window.now}
        spanMs={chart.window.spanMs}
        moving={gate.moving}
      />
      <Overlay model={model} hits={hits} nowRule={chart.nowRule === true} bare={bare} />
      {bare ? null : <Axes model={model} />}
      <Readout
        hits={hits}
        model={model}
        heading={hits[0] === undefined ? '' : liveLabel(hits[0].point.t)}
        valueOf={(hit) => withUnit(model.format(rawValue(chart.series, hit, stack)), model.unit)}
      />
    </View>
  );
}

function nowText(entry: ChartSeries, model: Model | null): string | null {
  const end = entry.points[entry.points.length - 1];
  return model === null || end === undefined ? null : withUnit(model.format(end.v), model.unit);
}

function LiveChrome({
  series,
  legend,
  stack,
  model,
  gesture,
  children,
}: {
  readonly series: readonly ChartSeries[];
  readonly legend: boolean;
  readonly stack: boolean;
  readonly model: Model | null;
  readonly gesture: ReturnType<typeof scrubGesture>;
  readonly children: ReactNode;
}): ReactNode {
  return (
    <View className="w-full gap-1.5">
      {legend && series.length > 1 ? (
        <ChartLegend series={series} valueOf={(entry) => nowText(entry, model)} />
      ) : null}
      <GestureDetector gesture={gesture}>{children}</GestureDetector>
      {model === null ? null : <Summary model={model} stack={stack} />}
    </View>
  );
}

export function LiveChart(props: LiveChartProps): ReactNode {
  const { width, onLayout } = useMeasuredWidth();
  const [scrubX, setScrubX] = useState<number | null>(null);
  const pointer = useIdiom() === 'pointer';
  const { model, area } = useLiveFrame(props, width);
  const hits = model === null || scrubX === null ? [] : hitsAt(model, scrubX);
  const box = { height: props.height ?? DEFAULT_HEIGHT };
  const plot = (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel={sentenceOf(props.label, model, props.series, props.stack === true)}
      style={box}
      className="relative w-full"
      onLayout={onLayout}
    >
      {model === null ? null : <LivePlot chart={props} model={model} area={area} hits={hits} />}
    </View>
  );
  return props.bare === true ? (
    plot
  ) : (
    <LiveChrome
      series={props.series}
      legend={props.legend !== false}
      stack={props.stack === true}
      model={model}
      gesture={scrubGesture(pointer, (point) => {
        setScrubX(point === null ? null : point.x);
      })}
    >
      {plot}
    </LiveChrome>
  );
}

function rawValue(series: readonly ChartSeries[], hit: Hit<ChartSeries>, stack: boolean): number {
  if (!stack) {
    return hit.point.v;
  }
  const own = series.find((entry) => entry.label === hit.series.label);
  return own?.points.find((point) => point.t === hit.point.t)?.v ?? hit.point.v;
}
