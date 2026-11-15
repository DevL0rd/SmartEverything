import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { AppHref } from './app-href';
import { useFrameBodyWidth } from './page-shell/body-width';
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
  readonly href?: AppHref;
}

export interface MetricStripProps {
  readonly items: readonly MetricItem[];
  readonly columns: StripColumns;
  readonly dense?: boolean;
}

const FRAME_BASE =
  'min-w-0 flex-1 basis-0 flex-row items-center gap-2 rounded-md border-hairline border-outline-variant bg-surface-1 elevation-1';

const FRAME = {
  regular: `${FRAME_BASE} min-h-16 px-3 py-2.5`,
  dense: `${FRAME_BASE} min-h-12 px-2 py-1.5`,
} as const;

function TileText({
  item,
  dense,
}: {
  readonly item: MetricItem;
  readonly dense: boolean;
}): ReactNode {
  const { label, value, unit, tone, caption, stale = false } = item;
  return (
    <View className="min-w-0 flex-1 self-start">
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
      {caption === undefined || dense ? null : (
        <Text variant="caption" tone={stale ? 'warning' : 'variant'} numberOfLines={2}>
          {caption}
        </Text>
      )}
    </View>
  );
}

function TileContent({
  item,
  width,
  dense,
}: {
  readonly item: MetricItem;
  readonly width: number;
  readonly dense: boolean;
}): ReactNode {
  const { series, stale = false } = item;
  const showSeries = series !== undefined && !stale && !dense && width >= SPARKLINE_MIN_TILE;
  return (
    <>
      <TileText item={item} dense={dense} />
      {showSeries ? (
        <View className="w-11 shrink-0">
          <Sparkline points={series} colour="on-surface-variant" height={24} />
        </View>
      ) : null}
    </>
  );
}

function MetricTile({
  item,
  dense,
}: {
  readonly item: MetricItem;
  readonly dense: boolean;
}): ReactNode {
  const { label, value, unit, onPress, href } = item;
  const { width, onLayout } = useMeasuredWidth();
  const spoken = [label, value, unit].filter((part) => part !== undefined).join(' ');
  const content = <TileContent item={item} width={width} dense={dense} />;
  const frame = FRAME[dense ? 'dense' : 'regular'];
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

export function MetricStrip({ items, columns, dense = false }: MetricStripProps): ReactNode {
  const fitted = stripColumnsAt(useFrameBodyWidth(), columns);
  const per = dense ? items.length : fitted;
  return (
    <View className="gap-2">
      {stripChunks(items, per).map((row) => (
        <View key={row[0]?.key} className="flex-row gap-2">
          {row.map((item) => (
            <MetricTile key={item.key} item={item} dense={dense} />
          ))}
        </View>
      ))}
    </View>
  );
}
