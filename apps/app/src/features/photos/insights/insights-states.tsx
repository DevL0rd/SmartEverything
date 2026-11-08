import type { PhotoInsights } from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { href } from '../../../app-shell/hrefs';
import { Banner } from '../../../components/banner';
import { Button } from '../../../components/button';
import { Card } from '../../../components/card';
import { ProgressBar } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { count } from '../../../format/number';
import { youngLibrary } from './heat-model';

const TILES = ['items', 'size', 'video', 'places', 'favourites', 'backup'] as const;

export function InsightsSkeleton(): ReactNode {
  return (
    <View aria-busy className="gap-4">
      <View className="flex-row flex-wrap gap-3">
        {TILES.map((tile) => (
          <Skeleton key={tile} shape="block" className="h-16 min-w-36 flex-1" />
        ))}
      </View>
      <View className="gap-4 large:flex-row">
        <Skeleton shape="tile" className="h-48 large:flex-1" />
        <Skeleton shape="tile" className="h-48 large:w-80" />
      </View>
      <Skeleton shape="tile" className="h-40" />
    </View>
  );
}

export function InsightsOffline(): ReactNode {
  return (
    <EmptyState
      icon="wifiOff"
      title="The hub is offline"
      body="Insights come back when the hub reconnects. Your photos stay on the hub as they are."
    />
  );
}

export function InsightsError({
  error,
  retry,
}: {
  readonly error: unknown;
  readonly retry: () => void;
}): ReactNode {
  return <ErrorState page error={error} retry={retry} />;
}

export function StaleBanner(): ReactNode {
  return (
    <Banner
      tone="info"
      title="Showing the last insights"
      body="The hub is offline. These numbers update when it is back."
    />
  );
}

export function InsightsEmpty(): ReactNode {
  return (
    <EmptyState
      icon="trendUp"
      title="No photos yet"
      body="Insights show what you take, where and when. Upload photos or back up a phone to start."
      action={<Button label="Open Backup" variant="tonal" href={href.photosPage('backup')} />}
    />
  );
}

export function RangeEmpty(): ReactNode {
  return (
    <EmptyState
      compact
      icon="calendar"
      title="Nothing in this range"
      body="No photos or videos were taken in this range. Pick a longer one to see your library."
    />
  );
}

function spanText(days: number): string {
  if (days < 14) return days === 1 ? '1 day' : `${count(days)} days`;
  return `${count(Math.floor(days / 7))} weeks`;
}

export function YoungCard({
  insights,
  today,
}: {
  readonly insights: PhotoInsights;
  readonly today: string;
}): ReactNode {
  const young = youngLibrary(insights.perDay, today);
  return (
    <Card title="Insights start after two months" icon="trendUp">
      <Text variant="callout" tone="variant">
        {young === null
          ? 'Charts fill in once this range spans two months of photos.'
          : `This range has ${spanText(young.days)} of photos. Charts fill in from ${young.ready}.`}
      </Text>
      {young === null ? null : (
        <ProgressBar
          progress={young.share}
          colour="primary"
          label={`${spanText(young.days)} of two months`}
        />
      )}
    </Card>
  );
}
