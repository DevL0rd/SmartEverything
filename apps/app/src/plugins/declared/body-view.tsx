import type { PluginId, WidgetBody } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { EmptyGraph, Gauge, Sparkline } from '../../components/charts';
import { Figure } from '../../components/figure';
import { Text } from '../../components/text';
import { heroFigure, widgetBodyHeight, type WidgetSize } from '../../components/widget-board';
import { useWidgetFrame } from '../../components/widget-board/widget-scope';
import { cn } from '../../design/cn';
import { FitList } from '../shared/plugin-widget';
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

const GAUGE_SIZE: Readonly<Record<WidgetSize, number>> = { M: 96, W: 96, XL: 128 };
const SPARK_HEIGHT: Readonly<Record<WidgetSize, number>> = { M: 44, W: 56, XL: 120 };
const LIST_ROW = 32;
const LIST_GAP = 4;

function Missing({ reason }: { readonly reason: string }): ReactNode {
  return (
    <Text variant="footnote" tone="variant" numberOfLines={3}>
      {reason}
    </Text>
  );
}

function Room({
  className,
  children,
}: {
  readonly className?: string;
  readonly children: (room: number | null) => ReactNode;
}): ReactNode {
  const frame = useWidgetFrame();
  const [room, setRoom] = useState(frame === null ? 0 : widgetBodyHeight(frame));
  if (frame === null) {
    return <View className={cn(className)}>{children(null)}</View>;
  }
  return (
    <View
      className={cn('min-h-0 flex-1', className)}
      onLayout={(event) => {
        setRoom(event.nativeEvent.layout.height);
      }}
    >
      {children(room)}
    </View>
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
    <Room className="flex-row items-start gap-4">
      {(room) => (
        <>
          <Gauge
            value={reading.value}
            min={body.min}
            max={body.max}
            bands={[{ upTo: body.max, colour: 'primary' }]}
            size={Math.min(GAUGE_SIZE[size], room ?? GAUGE_SIZE[size])}
            label={`${text} of ${formatNumber(body.max)}`}
          />
          <View className="min-w-0 flex-1 gap-0.5">
            <Figure value={text} size={heroFigure(size)} />
            <Text variant="caption" tone="variant" numberOfLines={2}>
              {`${formatNumber(body.min)} to ${formatNumber(body.max)}`}
            </Text>
          </View>
        </>
      )}
    </Room>
  );
}

function SparklineView({ pluginId, body, size }: ViewProps<'sparkline'>): ReactNode {
  const points = useStreamSeries(pluginId, body.value, body.minutes);
  const latest = points.at(-1);
  const height = (room: number | null): number => room ?? SPARK_HEIGHT[size];
  if (latest === undefined || points.length < 2) {
    return <Room>{(room) => <EmptyGraph text="Collecting readings" height={height(room)} />}</Room>;
  }
  return (
    <View className="min-h-0 flex-1 gap-2">
      <Figure value={formatNumber(latest.v)} size="m" />
      <Room>
        {(room) => <Sparkline points={points} colour="primary" height={height(room)} area />}
      </Room>
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

function moreCaption(hidden: number): ReactNode {
  return (
    <Text variant="caption" tone="variant">
      {`${String(hidden)} more`}
    </Text>
  );
}

function ListView({ pluginId, body }: ViewProps<'list'>): ReactNode {
  const reading = listReading(useStreamValue(pluginId, body.value), body.limit);
  if (reading.state === 'missing') return <Missing reason={reading.reason} />;
  if (reading.items.length === 0) return <Missing reason="Nothing to show." />;
  return (
    <FitList
      items={reading.items}
      keyOf={(item) => item.key}
      estimate={LIST_ROW}
      gap={LIST_GAP}
      beyond={reading.total - reading.items.length}
      more={moreCaption}
    >
      {(item) => <ListRow item={item} />}
    </FitList>
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
