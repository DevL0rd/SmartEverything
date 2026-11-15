import type { ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import type { DriveItem } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { Text } from '../../../components/text';
import { notifyFailure } from '../../../components/toast-store';
import { useIdiom } from '../../../design/platform';
import { flattenPages, useDriveConflicts, useDriveVersions } from '../data';
import { useRestore } from '../versions/restore';
import {
  COMPACT_CARD,
  CompactTimeline,
  CompactTimelineLoading,
  OneVersion,
  SizeOverYear,
  useTimelineLook,
} from '../versions/version-timeline';
import { Unloaded } from '../versions/versions-sheet-parts';
import { VersionsSheet, type VersionsSlots, type VersionsTarget } from '../versions/versions-sheet';
import {
  entriesOf,
  initialPicks,
  openConflictOf,
  restorePlanOf,
  totalOf,
  totalText,
  whenOf,
  type Clock,
  type VersionEntry,
} from '../versions/versions-model';
import type { DetailsSubject } from './details-model';

type VersionPages = ReturnType<typeof useDriveVersions>;

interface TabData {
  readonly entries: readonly VersionEntry[];
  readonly settled: boolean;
  readonly pages: VersionPages;
  readonly conflicted: boolean;
}

function useTabData(item: DriveItem): TabData {
  const pages = useDriveVersions(item.id, item.rootId);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = pages;
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    fetchNextPage().catch(notifyFailure('Earlier versions could not be read.'));
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);
  const conflicts = flattenPages(useDriveConflicts(item.rootId).data, (page) => page.items);
  return {
    entries: entriesOf(
      item,
      flattenPages(pages.data, (page) => page.items),
    ),
    settled: pages.data !== undefined && !hasNextPage,
    pages,
    conflicted: openConflictOf(conflicts, item.id) !== null,
  };
}

export function restoreLineOf(earlier: VersionEntry, conflicted: boolean, time: Clock): string {
  const { footer } = restorePlanOf(earlier, conflicted);
  return `Restores the version from ${whenOf(earlier, time)}. ${footer}`;
}

const NOTHING_AFTER_RESTORE = (): void => undefined;

interface ActionsProps {
  readonly subject: DetailsSubject;
  readonly earlier: VersionEntry;
  readonly conflicted: boolean;
  readonly time: Clock;
  readonly compare: () => void;
}

function Actions({ subject, earlier, conflicted, time, compare }: ActionsProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const restore = useRestore(subject.item, NOTHING_AFTER_RESTORE);
  const { versionId, primary } = restorePlanOf(earlier, conflicted);
  const size = pointer ? 'md' : 'lg';
  return (
    <View className="flex-row flex-wrap gap-2">
      <Button
        label="Compare"
        icon="git-compare-arrows"
        variant={primary ? 'tonal' : 'filled'}
        size={size}
        grow
        onPress={compare}
      />
      <Button
        label="Restore"
        icon="history"
        variant={primary ? 'filled' : 'text'}
        size={size}
        grow
        loading={restore.busy}
        disabled={versionId === null || !subject.writable}
        onPress={() => {
          if (versionId !== null) restore.run(versionId, whenOf(earlier, time));
        }}
      />
    </View>
  );
}

function Settled({
  subject,
  data,
  compare,
}: {
  readonly subject: DetailsSubject;
  readonly data: TabData;
  readonly compare: () => void;
}): ReactNode {
  const look = useTimelineLook(data.entries);
  const earlier = data.entries[1];
  if (earlier === undefined) return <OneVersion kept={subject.versionsKept} />;
  return (
    <View className="gap-4">
      <SizeOverYear
        entries={data.entries}
        total={totalText(totalOf(data.entries))}
        now={look.time.now}
      />
      <View className={COMPACT_CARD}>
        <CompactTimeline entries={data.entries} look={look} />
      </View>
      <Actions
        subject={subject}
        earlier={earlier}
        conflicted={data.conflicted}
        time={look.time}
        compare={compare}
      />
      <Text variant="footnote" tone="variant">
        {restoreLineOf(earlier, data.conflicted, look.time)}
      </Text>
    </View>
  );
}

const NO_SLOTS: VersionsSlots = {};

export function VersionsTab({
  subject,
  slots = NO_SLOTS,
}: {
  readonly subject: DetailsSubject;
  readonly slots?: VersionsSlots;
}): ReactNode {
  const data = useTabData(subject.item);
  const [target, setTarget] = useState<VersionsTarget | null>(null);
  const compare = (): void => {
    setTarget({
      versionsKept: subject.versionsKept,
      item: subject.item,
      picks: initialPicks(data.entries),
    });
  };
  return (
    <>
      {data.settled ? (
        <Settled subject={subject} data={data} compare={compare} />
      ) : (
        <Unloaded pages={data.pages} loading={<CompactTimelineLoading />} />
      )}
      <VersionsSheet
        target={target}
        slots={slots}
        onClose={() => {
          setTarget(null);
        }}
      />
    </>
  );
}
