import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { Href } from 'expo-router';
import { cn } from '../design/cn';
import { useSizeClass } from '../design/size-class';
import { Sparkline } from './charts/sparkline';
import type { ChartPoint } from './charts/scale';
import { Figure } from './figure';
import { Icon } from './icon';
import { Interactive } from './interactive';
import { stripChunks, stripColumnsAt, type StripColumns } from './strip-rows';
import { Text } from './text';
import type { Tone } from './tone';
import { useMeasuredWidth } from './use-measured-width';

const SPARKLINE_MIN_TILE = 134;

export interface MetricItem {
  readonly key: string;
  readonly label: string;
  readonly value: string;
  readonly unit?: string;
  readonly tone?: Tone;
  readonly caption?: string;
  readonly series?: readonly ChartPoint[];
  readonly stale?: boolean;
  readonly onPress?: () => void;
  readonly href?: Href;
}

export interface MetricStripProps {
  readonly items: readonly MetricItem[];
  readonly columns: StripColumns;
}

const FRAME =
  'min-h-16 min-w-0 flex-1 basis-0 flex-row items-center gap-2 rounded-md border-hairline border-outline-variant bg-surface-1 px-3 py-2.5 elevation-1';

function TileText({ item }: { readonly item: MetricItem }): ReactNode {
  const { label, value, unit, tone, caption, stale = false } = item;
  return (
    <View className="min-w-0 flex-1">
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {label}
      </Text>
      <View className="flex-row items-center gap-1.5">
        <Figure
          value={value}
          size="s"
          stale={stale}
          {...(unit === undefined ? {} : { unit })}
          {...(tone === undefined ? {} : { tone })}
        />
        {tone === 'warning' ? <Icon name="warning" size={16} tone="warning" /> : null}
      </View>
      {caption === undefined ? null : (
        <Text variant="caption" tone="variant" numberOfLines={1}>
          {caption}
        </Text>
      )}
    </View>
  );
}

function TileContent({
  item,
  width,
}: {
  readonly item: MetricItem;
  readonly width: number;
}): ReactNode {
  const { series, stale = false } = item;
  const showSeries = series !== undefined && !stale && width >= SPARKLINE_MIN_TILE;
  return (
    <>
      <TileText item={item} />
      {showSeries ? (
        <View className="w-11 shrink-0">
          <Sparkline points={series} colour="on-surface-variant" height={24} />
        </View>
      ) : null}
    </>
  );
}

function MetricTile({ item }: { readonly item: MetricItem }): ReactNode {
  const { label, value, unit, stale = false, onPress, href } = item;
  const { width, onLayout } = useMeasuredWidth();
  const frame = cn(FRAME, stale && 'opacity-60');
  const spoken = [label, value, unit].filter((part) => part !== undefined).join(' ');
  const content = <TileContent item={item} width={width} />;
  if (onPress === undefined && href === undefined) {
    return (
      <View accessible accessibilityLabel={spoken} onLayout={onLayout} className={frame}>
        {content}
      </View>
    );
  }
  return (
    <View className="min-w-0 flex-1 basis-0" onLayout={onLayout}>
      <Interactive
        onPress={onPress}
        href={href}
        label={spoken}
        className={frame}
        layerClassName="rounded-md"
      >
        {content}
      </Interactive>
    </View>
  );
}

export function MetricStrip({ items, columns }: MetricStripProps): ReactNode {
  const per = stripColumnsAt(useSizeClass().area, columns);
  return (
    <View className="gap-2">
      {stripChunks(items, per).map((row) => (
        <View key={row[0]?.key} className="flex-row gap-2">
          {row.map((item) => (
            <MetricTile key={item.key} item={item} />
          ))}
        </View>
      ))}
    </View>
  );
}
