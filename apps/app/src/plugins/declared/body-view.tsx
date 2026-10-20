import type { PluginId, WidgetBody } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyGraph, Gauge, Sparkline } from '../../components/charts';
import { Figure } from '../../components/figure';
import { Text } from '../../components/text';
import { heroFigure, type WidgetSize } from '../../components/widget-board';
import { ControlsView } from './controls-view';
import {
  formatNumber,
  listReading,
  numberReading,
  textReading,
  type ListItem,
} from './stream-value';
import { useStreamSeries } from './use-stream-series';
import { useStreamValue } from './use-stream-value';

const GAUGE_SIZE = 96;
const SPARK_HEIGHT: Readonly<Record<WidgetSize, number>> = { M: 44, W: 56, XL: 120 };

function Missing({ reason }: { readonly reason: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" numberOfLines={3}>
      {reason}
    </Text>
  );
}

type Body<T extends WidgetBody['type']> = Extract<WidgetBody, { readonly type: T }>;

interface ViewProps<T extends WidgetBody['type']> {
  readonly pluginId: PluginId;
  readonly body: Body<T>;
  readonly size: WidgetSize;
}

function FigureView({ pluginId, body, size }: ViewProps<'figure'>): ReactNode {
  const reading = textReading(useStreamValue(pluginId, body.value));
  if (reading.state === 'missing') return <Missing reason={reading.reason} />;
  return (
    <View className="gap-1">
      <Figure value={reading.text} size={heroFigure(size)} />
      {body.caption === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={2}>
          {body.caption}
        </Text>
      )}
    </View>
  );
}

function GaugeView({ pluginId, body, size }: ViewProps<'gauge'>): ReactNode {
  const reading = numberReading(useStreamValue(pluginId, body.value));
  if (reading.state === 'missing') return <Missing reason={reading.reason} />;
  const text = formatNumber(reading.value);
  return (
    <View className="flex-1 flex-row items-center gap-4">
      <Gauge
        value={reading.value}
        min={body.min}
        max={body.max}
        bands={[{ upTo: body.max, colour: 'primary' }]}
        size={GAUGE_SIZE}
        label={`${text} of ${formatNumber(body.max)}`}
      />
      <View className="min-w-0 flex-1 gap-0.5">
        <Figure value={text} size={heroFigure(size)} />
        <Text variant="caption" tone="faint" numberOfLines={1}>
          {`${formatNumber(body.min)} to ${formatNumber(body.max)}`}
        </Text>
      </View>
    </View>
  );
}

function SparklineView({ pluginId, body, size }: ViewProps<'sparkline'>): ReactNode {
  const points = useStreamSeries(pluginId, body.value, body.minutes);
  const latest = points.at(-1);
  const height = SPARK_HEIGHT[size];
  if (latest === undefined || points.length < 2) {
    return <EmptyGraph text="Collecting readings" height={height} />;
  }
  return (
    <View className="flex-1 justify-between gap-2">
      <Figure value={formatNumber(latest.v)} size="m" />
      <Sparkline points={points} colour="primary" height={height} area />
    </View>
  );
}

function ListRow({ item }: { readonly item: ListItem }): ReactNode {
  return (
    <View className="min-h-8 flex-row items-center justify-between gap-3">
      <Text variant="callout" numberOfLines={1} className="min-w-0 shrink">
        {item.title}
      </Text>
      {item.detail === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {item.detail}
        </Text>
      )}
    </View>
  );
}

function ListView({ pluginId, body }: ViewProps<'list'>): ReactNode {
  const reading = listReading(useStreamValue(pluginId, body.value), body.limit);
  if (reading.state === 'missing') return <Missing reason={reading.reason} />;
  if (reading.items.length === 0) return <Missing reason="Nothing to show." />;
  return (
    <View className="gap-1">
      {reading.items.map((item) => (
        <ListRow key={item.key} item={item} />
      ))}
      {reading.total > reading.items.length ? (
        <Text variant="caption" tone="faint">
          {`${String(reading.total - reading.items.length)} more`}
        </Text>
      ) : null}
    </View>
  );
}

export function BodyView({ pluginId, body, size }: ViewProps<WidgetBody['type']>): ReactNode {
  switch (body.type) {
    case 'figure':
      return <FigureView pluginId={pluginId} body={body} size={size} />;
    case 'gauge':
      return <GaugeView pluginId={pluginId} body={body} size={size} />;
    case 'sparkline':
      return <SparklineView pluginId={pluginId} body={body} size={size} />;
    case 'list':
      return <ListView pluginId={pluginId} body={body} size={size} />;
    case 'controls':
      return <ControlsView pluginId={pluginId} items={body.items} />;
  }
}
