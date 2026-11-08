import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveDurationBucket, PhotoInsights } from '@smarteverything/domain';
import { Bars } from '../../../components/charts';
import { FlatChoice } from '../../../components/flat-choice';
import { Skeleton } from '../../../components/skeleton';
import { StatTile } from '../../../components/stat-tile';
import { Text } from '../../../components/text';
import { ChipRow } from '../../nas/frame';
import {
  durationChipsOf,
  hoursBarsOf,
  hoursLabelOf,
  hoursText,
  peakHoursOf,
  peakHoursText,
  videoStatsOf,
  type HoursAdded,
} from './video-model';

const BARS_HEIGHT = 36;

function HoursTile({ hours }: { readonly hours: HoursAdded }): ReactNode {
  const peak = peakHoursOf(hours);
  const caption = peakHoursText(hours);
  return (
    <View className="min-h-24 gap-2 rounded-lg bg-surface-2 p-3">
      <Text variant="footnote" tone="variant" numberOfLines={1}>
        Hours added per month
      </Text>
      <Bars
        bars={hoursBarsOf(hours)}
        colour="viz-3"
        label={hoursLabelOf(hours)}
        height={BARS_HEIGHT}
        {...(peak === null ? {} : { highlightKey: peak.month })}
        formatValue={hoursText}
      />
      {caption === null ? null : (
        <Text variant="footnote" tone="variant" numberOfLines={1}>
          {caption}
        </Text>
      )}
    </View>
  );
}

function StatTiles({
  insights,
  compact,
}: {
  readonly insights: PhotoInsights;
  readonly compact: boolean;
}): ReactNode {
  const stats = videoStatsOf(insights);
  return (
    <>
      {compact ? null : (
        <View className="min-w-0 flex-1">
          <StatTile label="Videos" value={stats.videos} caption={stats.size} compact={compact} />
        </View>
      )}
      <View className="min-w-0 flex-1">
        <StatTile
          label="Total time"
          value={stats.totalTime}
          compact={compact}
          {...(stats.watching === null ? {} : { caption: stats.watching })}
        />
      </View>
      {stats.longest === null ? null : (
        <View className="min-w-0 flex-1">
          <StatTile label="Longest" value={stats.longest} compact={compact} />
        </View>
      )}
    </>
  );
}

export interface VideoStatsProps {
  readonly insights: PhotoInsights | undefined;
  readonly hours: HoursAdded | null;
  readonly compact: boolean;
}

export function VideoStatsRow({ insights, hours, compact }: VideoStatsProps): ReactNode {
  if (insights === undefined) {
    return <Skeleton shape="block" className="h-24" />;
  }
  if (compact) {
    return (
      <View className="gap-2">
        <View className="flex-row gap-2">
          <StatTiles insights={insights} compact />
        </View>
        {hours === null ? null : <HoursTile hours={hours} />}
      </View>
    );
  }
  return (
    <View className="flex-row gap-3">
      <StatTiles insights={insights} compact={false} />
      {hours === null ? null : (
        <View className="min-w-0 flex-2">
          <HoursTile hours={hours} />
        </View>
      )}
    </View>
  );
}

export interface DurationChipsProps {
  readonly insights: PhotoInsights | undefined;
  readonly bucket: DriveDurationBucket | null;
  readonly onBucket: (bucket: DriveDurationBucket | null) => void;
}

export function DurationChips({ insights, bucket, onBucket }: DurationChipsProps): ReactNode {
  if (insights === undefined || insights.videoTotals.items === 0) return null;
  return (
    <View className="border-b border-outline-variant">
      <ChipRow label="Length">
        {durationChipsOf(insights).map((chip) => (
          <FlatChoice
            key={chip.bucket ?? 'all'}
            label={chip.label}
            count={chip.count}
            role="radio"
            active={chip.bucket === bucket}
            onPress={() => {
              onBucket(chip.bucket);
            }}
          />
        ))}
      </ChipRow>
    </View>
  );
}
