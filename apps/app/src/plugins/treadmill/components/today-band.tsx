import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Card } from '../../../components/card';
import { Rings } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { LoadedQuery } from '../../../components/loaded-query';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { useTreadmillView } from '../data/treadmill-data';
import { RING_DOT, ringSentence, streakLine, type StatsView } from '../model/today-model';
import { ringsWithClimb } from '../model/widget-model';
import { GhostBars } from './ghost-bars';

const RING_PX = 132;

function Legend({ view }: { readonly view: StatsView }): ReactNode {
  return (
    <View className="min-w-0 flex-1 gap-2">
      {ringsWithClimb(view).map((item) => (
        <View
          key={item.key}
          accessible
          accessibilityLabel={ringSentence(item)}
          className="flex-row items-center gap-2"
        >
          <View className={cn('size-2.5 rounded-full', RING_DOT[item.colour])} />
          <View className="min-w-0 flex-1">
            <Text variant="caption" tone="variant" numberOfLines={1}>
              {item.name}
            </Text>
            <Text variant="body-strong" className="tabular" numberOfLines={2}>
              {item.done} of {item.goal}
            </Text>
          </View>
        </View>
      ))}
    </View>
  );
}

function TodayBody({ view }: { readonly view: StatsView }): ReactNode {
  const { stats } = view;
  return (
    <View className="gap-4">
      <View className="flex-row items-center gap-4">
        <Rings
          size={RING_PX}
          rings={ringsWithClimb(view).map((item) => ({
            progress: item.progress,
            colour: item.colour,
            label: ringSentence(item),
          }))}
        />
        <Legend view={view} />
      </View>
      <View className="gap-1">
        <Text variant="caption" tone="variant">
          Distance per day this week, last week behind
        </Text>
        <GhostBars
          buckets={stats.buckets}
          previous={stats.previousBuckets}
          range="week"
          metric="distance"
          label="Distance per day this week in kilometres, with last week behind"
          height={96}
        />
      </View>
      <View className="flex-row items-center gap-2">
        <Icon name="flame" size={20} tone={stats.streak.current > 0 ? 'warning' : 'faint'} />
        <Text variant="callout">{streakLine(stats.streak)}</Text>
      </View>
    </View>
  );
}

export function TodayBand({ deviceId }: { readonly deviceId: string }): ReactNode {
  const stats = useTreadmillView(deviceId, 'stats', { range: 'week' });
  return (
    <Card title="Today and this week" icon="calendar">
      <LoadedQuery query={stats}>{(view) => <TodayBody view={view} />}</LoadedQuery>
    </Card>
  );
}
