import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DuplicateStats } from '@smarteverything/domain';
import { ProgressBar, SegmentBar } from '../../../components/charts';
import { Figure } from '../../../components/figure';
import { Icon } from '../../../components/icon';
import { Skeleton } from '../../../components/skeleton';
import { StatTile } from '../../../components/stat-tile';
import { Text } from '../../../components/text';
import { bytes, count } from '../../../format/number';
import { KEEP_BEST_RULE, libraryShareOf, sourceSegmentsOf, type SourceLabels } from './model';

interface StatsProps {
  readonly stats: DuplicateStats;
  readonly libraryBytes: number | undefined;
}

interface SourcesProps {
  readonly stats: DuplicateStats;
  readonly labels: SourceLabels;
}

function SourcesTile({ stats, labels }: SourcesProps): ReactNode {
  return (
    <View className="min-h-24 gap-2 rounded-lg bg-surface-2 p-3">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        Copies by drive
      </Text>
      <SegmentBar
        segments={sourceSegmentsOf(stats, labels)}
        label="Copies by drive"
        size="regular"
        legend
        format={count}
      />
    </View>
  );
}

function SpaceTile({ stats, libraryBytes }: StatsProps): ReactNode {
  const share = libraryShareOf(stats.bytesBack, libraryBytes);
  return (
    <View className="min-h-24 gap-1 rounded-lg bg-surface-2 p-3">
      <View className="flex-row items-center gap-2">
        <Text variant="footnote" tone="variant" numberOfLines={1} className="min-w-0 flex-1">
          Space you get back
        </Text>
        {share === null ? null : (
          <Text variant="footnote" tone="variant" className="tabular-nums" numberOfLines={1}>
            {share.total}
          </Text>
        )}
      </View>
      <Figure value={bytes(stats.bytesBack)} size="s" tone="positive" />
      {share === null ? null : (
        <ProgressBar progress={share.share} colour="positive" label="Share of the library" />
      )}
    </View>
  );
}

function PhoneFigure({
  value,
  label,
  positive = false,
}: {
  readonly value: string;
  readonly label: string;
  readonly positive?: boolean;
}): ReactNode {
  return (
    <View className="min-w-0">
      <Figure value={value} size="s" tone={positive ? 'positive' : 'default'} />
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

function PhoneStats({ stats }: { readonly stats: DuplicateStats }): ReactNode {
  return (
    <View className="flex-row flex-wrap gap-4 rounded-lg bg-surface-2 px-4 py-3">
      <PhoneFigure value={count(stats.groups)} label="groups" />
      <PhoneFigure value={count(stats.extraCopies)} label="copies" />
      <PhoneFigure value={bytes(stats.bytesBack)} label="to get back" positive />
    </View>
  );
}

export function DuplicateStatsRow({
  stats,
  libraryBytes,
  labels,
  compact,
}: StatsProps & { readonly labels: SourceLabels; readonly compact: boolean }): ReactNode {
  if (compact) {
    return (
      <View className="gap-2">
        <PhoneStats stats={stats} />
        <SourcesTile stats={stats} labels={labels} />
      </View>
    );
  }
  return (
    <View className="flex-row gap-3">
      <View className="min-w-0 flex-1">
        <StatTile label="Groups" value={count(stats.groups)} />
      </View>
      <View className="min-w-0 flex-1">
        <StatTile label="Extra copies" value={count(stats.extraCopies)} />
      </View>
      <View className="min-w-0 flex-2">
        <SpaceTile stats={stats} libraryBytes={libraryBytes} />
      </View>
      <View className="min-w-0 flex-2">
        <SourcesTile stats={stats} labels={labels} />
      </View>
    </View>
  );
}

export function KeepBestRule(): ReactNode {
  return (
    <View className="flex-row items-start gap-2">
      <Icon name="check" size={16} tone="positive" />
      <Text variant="footnote" tone="variant" className="min-w-0 flex-1">
        {KEEP_BEST_RULE}
      </Text>
    </View>
  );
}

export function DuplicatesLoading({ compact }: { readonly compact: boolean }): ReactNode {
  return (
    <View accessibilityLabel="Loading duplicates" className="gap-4">
      <View className={compact ? 'gap-2' : 'flex-row gap-3'}>
        <View className="min-w-0 flex-1">
          <Skeleton shape="block" />
        </View>
        <View className="min-w-0 flex-1">
          <Skeleton shape="block" />
        </View>
      </View>
      <Skeleton shape="text" />
      <Skeleton shape="tile" />
      <Skeleton shape="tile" />
    </View>
  );
}
