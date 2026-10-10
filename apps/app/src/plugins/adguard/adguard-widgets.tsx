import type { AdGuardSnapshot, AdGuardStats } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Sparkline } from '../../components/charts';
import { Figure } from '../../components/figure';
import { Switch } from '../../components/switch';
import { Text } from '../../components/text';
import type { BoardClass, WidgetDefinition, WidgetSize } from '../../components/widget-board';
import { decimal, percent } from '../../format/number';
import { PluginWidgetFrame } from '../shared/plugin-widget';
import {
  adguardNotice,
  protectionText,
  useAdGuardDevice,
  useAdGuardSnapshot,
  useAdGuardTools,
} from './adguard-data';
import { periodText } from './stats-period';

const SIZES: Readonly<Record<BoardClass, readonly WidgetSize[]>> = {
  compact: ['S', 'M', 'L'],
  medium: ['S', 'M', 'L'],
  expanded: ['S', 'M', 'W', 'L'],
};

const TOP_ROWS = 5;

function unavailable(snapshot: AdGuardSnapshot): string | null {
  const notice = adguardNotice(snapshot);
  if (notice !== null) {
    return notice.title;
  }
  return snapshot.stats === null ? 'Waiting for AdGuard Home…' : null;
}

function blockedShare(stats: AdGuardStats): { t: number; v: number }[] {
  return stats.history.map((queries, index) => ({
    t: index,
    v: queries === 0 ? 0 : ((stats.historyBlocked[index] ?? 0) / queries) * 100,
  }));
}

function TopBlocked({ stats }: { readonly stats: AdGuardStats }): ReactNode {
  return (
    <View className="gap-1">
      {stats.topBlocked.slice(0, TOP_ROWS).map((entry) => (
        <View key={entry.name} className="flex-row justify-between gap-2">
          <Text variant="footnote" numberOfLines={1} className="flex-1">
            {entry.name}
          </Text>
          <Text variant="footnote" tone="variant">
            {decimal(entry.count)}
          </Text>
        </View>
      ))}
    </View>
  );
}

function Blocking({
  snapshot,
  size,
}: {
  readonly snapshot: AdGuardSnapshot;
  readonly size: WidgetSize;
}): ReactNode {
  const { stats, status } = snapshot;
  if (stats === null) {
    return null;
  }
  return (
    <View className="gap-2">
      <Figure
        value={percent(stats.blockedPercent / 100, 1)}
        unit="blocked"
        size={size === 'S' ? 'm' : 'l'}
      />
      <Text
        variant="footnote"
        tone={status?.protection === false ? 'warning' : 'variant'}
        numberOfLines={1}
      >
        {status === null || status.protection
          ? `${decimal(stats.blocked)} of ${decimal(stats.queries)}, ${periodText(stats)}`
          : protectionText(status)}
      </Text>
      {size === 'S' ? null : <Sparkline points={blockedShare(stats)} colour="critical" area />}
      {size === 'L' ? <TopBlocked stats={stats} /> : null}
    </View>
  );
}

function AdBlockingWidget({ size }: { readonly size: WidgetSize }): ReactNode {
  const tools = useAdGuardTools();
  const stream = useAdGuardSnapshot();
  const status = stream.state === 'ready' ? stream.value.status : null;
  return (
    <PluginWidgetFrame
      title="Ad blocking"
      icon="shield"
      accent="info"
      size={size}
      device={useAdGuardDevice()}
      stream={stream}
      unavailable={unavailable}
      action={
        status === null || size === 'S' ? null : (
          <Switch
            label="Ad blocking"
            value={status.protection}
            onChange={(enabled) =>
              void tools.run(
                enabled ? 'resume_protection' : 'pause_protection',
                enabled ? {} : { minutes: 60 },
              )
            }
          />
        )
      }
    >
      {(snapshot) => <Blocking snapshot={snapshot} size={size} />}
    </PluginWidgetFrame>
  );
}

export const ADGUARD_WIDGETS: readonly WidgetDefinition[] = [
  {
    type: 'adguard.blocking',
    title: 'Ad blocking',
    icon: 'shield',
    group: 'Network',
    sizes: SIZES,
    defaultSize: 'M',
    render: ({ size }) => <AdBlockingWidget size={size} />,
  },
];
