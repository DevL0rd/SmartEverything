import type { ReactNode } from 'react';
import { useEffect, useMemo } from 'react';
import { View } from 'react-native';
import type { DriveFeedRow } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { Button } from '../../../components/button';
import { EmptyState } from '../../../components/empty-state';
import { ErrorState } from '../../../components/error-state';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { useScreenPaused } from '../../../design/screen-pause';
import { plural } from '../../../format/text';
import { localDayKey } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { useProfiles } from '../../../store/people';
import { useDevices, useSession, useSettings, useSyncStatus } from '../../../store/selectors';
import { flattenPages, useDriveItemActivity } from '../../nas/data';
import {
  activityItemOf,
  feedRowsOf,
  type ActivityNames,
  type FeedHead,
  type FeedLine,
} from '../activity/activity-filters';
import { ActivityRow } from '../activity/activity-row';
import type { DetailsSubject, DetailsTabSlot } from './details-model';

type ItemPages = ReturnType<typeof useDriveItemActivity>;

export interface ActivityDay {
  readonly head: FeedHead;
  readonly lines: readonly FeedLine[];
}

export function activityDaysOf(
  rows: readonly DriveFeedRow[],
  subject: DetailsSubject,
  names: ActivityNames,
  today: { readonly zone: string | null; readonly day: string },
): readonly ActivityDay[] {
  const entries = rows.map((row) => activityItemOf({ row, item: subject.item }, names).entry);
  const days: { head: FeedHead; lines: FeedLine[] }[] = [];
  for (const feed of feedRowsOf(entries, today.zone, today.day)) {
    if (feed.kind === 'head') days.push({ head: feed, lines: [] });
    else days.at(-1)?.lines.push(feed);
  }
  return days;
}

export function itemActivityHref(subject: DetailsSubject): ReturnType<typeof href.drivePage> {
  return href.drivePage('activity', { item: subject.item.id });
}

function useNames(subject: DetailsSubject): ActivityNames {
  const profiles = useProfiles();
  const devices = useDevices({ includeHidden: true });
  const { id, label } = subject.root;
  return useMemo(
    () => ({
      roots: new Map([[id, label]]),
      people: new Map(profiles.map((profile) => [profile.id, profile.name])),
      devices: new Map(devices.map((device) => [device.id, device.name])),
    }),
    [id, label, profiles, devices],
  );
}

function useToday(): { readonly zone: string | null; readonly day: string } {
  const zone = useSettings().time_zone;
  const day = useMinuteOf((minute) => localDayKey(minute, zone));
  return { zone, day };
}

function useWholeItemFeed(pages: ItemPages): void {
  const paused = useScreenPaused();
  const due = !paused && pages.hasNextPage && !pages.isFetchingNextPage && !pages.isError;
  const { fetchNextPage } = pages;
  useEffect(() => {
    if (due) background(fetchNextPage({ cancelRefetch: false }), 'drive.item_activity.page_failed');
  }, [due, fetchNextPage]);
}

const SKELETON_ROWS = ['a', 'b', 'c'] as const;

function Unloaded({ pages }: { readonly pages: ItemPages }): ReactNode {
  const live = useSyncStatus().status === 'live';
  if (!live) {
    return (
      <EmptyState
        compact
        icon="wifiOff"
        title="The hub is offline"
        body="Activity comes back when the hub reconnects. Your files stay on the hub as they are."
      />
    );
  }
  if (pages.isError) {
    return (
      <ErrorState
        error={pages.error}
        retry={() => {
          background(pages.refetch(), 'drive.item_activity.retry_failed');
        }}
      />
    );
  }
  return (
    <View aria-busy accessibilityLabel="Loading activity" className="gap-2">
      {SKELETON_ROWS.map((key) => (
        <Skeleton key={key} shape="block" className="h-row-h-2" />
      ))}
    </View>
  );
}

function Day({ day, me }: { readonly day: ActivityDay; readonly me: string | null }): ReactNode {
  return (
    <View className="gap-2">
      <View className="flex-row items-baseline justify-between gap-3 px-4">
        <Text variant="footnote" tone="variant" accessibilityRole="header" numberOfLines={1}>
          {day.head.title}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {day.head.detail}
        </Text>
      </View>
      <View
        role="list"
        className="overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1"
      >
        {day.lines.map((line, index) => (
          <View key={line.key} className={index === 0 ? '' : 'border-t border-outline-variant'}>
            <ActivityRow entry={line.entry} me={me} />
          </View>
        ))}
      </View>
    </View>
  );
}

function OpenInActivity({ subject }: { readonly subject: DetailsSubject }): ReactNode {
  const pointer = useIdiom() === 'pointer';
  return (
    <Button
      label="Open in Activity"
      icon="activity"
      variant="tonal"
      size={pointer ? 'md' : 'lg'}
      grow={!pointer}
      href={itemActivityHref(subject)}
    />
  );
}

function Feed({
  subject,
  rows,
}: {
  readonly subject: DetailsSubject;
  readonly rows: readonly DriveFeedRow[];
}): ReactNode {
  const me = useSession().client.profile_id;
  const days = activityDaysOf(rows, subject, useNames(subject), useToday());
  if (days.length === 0) {
    return (
      <EmptyState
        compact
        icon="activity"
        title="No changes yet"
        body="Every change to this item shows here: who or what made it, and from where."
      />
    );
  }
  return (
    <View className="gap-4">
      <View className="flex-row flex-wrap items-center justify-between gap-2">
        <Text variant="label" tone="variant" className="tabular">
          {plural(rows.length, 'change')}
        </Text>
        <OpenInActivity subject={subject} />
      </View>
      {days.map((day) => (
        <Day key={day.head.key} day={day} me={me} />
      ))}
    </View>
  );
}

export function ActivityTab({ subject }: { readonly subject: DetailsSubject }): ReactNode {
  const pages = useDriveItemActivity(subject.item.id, subject.root.id);
  useWholeItemFeed(pages);
  if (pages.data === undefined) return <Unloaded pages={pages} />;
  return <Feed subject={subject} rows={flattenPages(pages.data, (page) => page.items)} />;
}

export const activityTab: DetailsTabSlot = function ActivitySlot(subject) {
  return <ActivityTab key={subject.item.id} subject={subject} />;
};
