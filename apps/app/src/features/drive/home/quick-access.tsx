import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { Image } from 'expo-image';
import type { DriveItem, DriveRecentEntry } from '@smarteverything/domain';
import { background } from '@smarteverything/logging';
import { href } from '../../../app-shell/hrefs';
import { ErrorState } from '../../../components/error-state';
import { HScroller } from '../../../components/h-scroller';
import type { IconName } from '../../../components/icon';
import { IconWell } from '../../../components/icon-well';
import { Interactive } from '../../../components/interactive';
import { Section, SectionAction } from '../../../components/section';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import type { ColourRole } from '../../../design/tokens';
import { useMinuteOf } from '../../../store/clock';
import { sameJson } from '../../../store/same-json';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { flattenPages, useDriveLink, useDriveRecent, useDriveRoots, useViewerId } from '../data';
import { openHrefOf } from '../recent/recent-model';
import {
  entriesInDrive,
  recentCaptionOf,
  recentIdsOf,
  recentKeyOf,
  type RecentNames,
} from './quick-access-model';

const PLACEHOLDERS = ['a', 'b', 'c'] as const;

const KIND_LOOK: Readonly<Record<DriveItem['kind'], { icon: IconName; colour: ColourRole }>> = {
  folder: { icon: 'folder', colour: 'viz-2' },
  image: { icon: 'image', colour: 'viz-1' },
  video: { icon: 'film', colour: 'viz-3' },
  audio: { icon: 'music', colour: 'viz-4' },
  document: { icon: 'fileText', colour: 'viz-6' },
  other: { icon: 'fileText', colour: 'on-surface-variant' },
};

function namesIn(
  state: StoreState,
  people: readonly string[],
  devices: readonly string[],
): Omit<RecentNames, 'me'> {
  const { profiles, devices: known } = state.tables;
  return {
    people: Object.fromEntries(
      people.flatMap((id) => {
        const row = profiles.byId[id];
        return row === undefined ? [] : [[id, row.name]];
      }),
    ),
    devices: Object.fromEntries(
      devices.flatMap((id) => {
        const row = known.byId[id];
        return row === undefined ? [] : [[id, row.label]];
      }),
    ),
  };
}

function useRecentNames(entries: readonly DriveRecentEntry[]): RecentNames {
  const me = useViewerId();
  const { people, devices } = recentIdsOf(entries);
  const named = useStoreSelector((state) => namesIn(state, people, devices), sameJson, [
    people.join('\n'),
    devices.join('\n'),
  ]);
  return { me, ...named };
}

function Thumb({ item }: { readonly item: DriveItem }): ReactNode {
  const look = KIND_LOOK[item.kind];
  const ready = item.kind !== 'folder' && item.thumb.state === 'ready';
  const url = useDriveLink(ready ? item.id : null, item.rev, 'thumb');
  return (
    <View className="h-12 w-16 items-center justify-center overflow-hidden rounded-sm bg-surface-3">
      {url === null ? (
        <IconWell icon={look.icon} colour={look.colour} size="s" />
      ) : (
        <Image
          source={{ uri: url, cacheKey: `${item.id}:${String(item.rev)}` }}
          contentFit="cover"
          cachePolicy="disk"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      )}
    </View>
  );
}

function RecentCard({
  entry,
  names,
}: {
  readonly entry: DriveRecentEntry;
  readonly names: RecentNames;
}): ReactNode {
  const caption = useMinuteOf((now) => recentCaptionOf(entry, names, now));
  const roots = useDriveRoots();
  const { item } = entry;
  return (
    <Interactive
      href={openHrefOf(item, roots)}
      label={`${item.name}, ${caption}`}
      className="w-68 flex-row items-center gap-3 rounded-md border-hairline border-outline-variant bg-surface-1 p-2"
      layerClassName="rounded-md"
    >
      <Thumb item={item} />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="footnote" numberOfLines={1} className="font-sans-medium">
          {item.name}
        </Text>
        <Text variant="caption" tone="variant" numberOfLines={1} className="tabular">
          {caption}
        </Text>
      </View>
    </Interactive>
  );
}

function RecentSkeleton(): ReactNode {
  return (
    <View aria-busy className="flex-row gap-grid-gap overflow-hidden">
      {PLACEHOLDERS.map((key) => (
        <Skeleton key={key} shape="tile" className="h-16 w-68" />
      ))}
    </View>
  );
}

function RecentCards({ entries }: { readonly entries: readonly DriveRecentEntry[] }): ReactNode {
  const names = useRecentNames(entries);
  return (
    <HScroller label="Quick access" fade fadeSurface="bg">
      {entries.map((entry) => (
        <RecentCard key={recentKeyOf(entry)} entry={entry} names={names} />
      ))}
    </HScroller>
  );
}

function RecentBody({
  query,
  entries,
}: {
  readonly query: ReturnType<typeof useDriveRecent>;
  readonly entries: readonly DriveRecentEntry[];
}): ReactNode {
  if (query.data !== undefined) return <RecentCards entries={entries} />;
  if (!query.isError) return <RecentSkeleton />;
  return (
    <ErrorState
      error={query.error}
      retry={() => {
        background(query.refetch(), 'drive.recent_refetch_failed');
      }}
    />
  );
}

export function QuickAccessRow({ rootId }: { readonly rootId: string }): ReactNode {
  const query = useDriveRecent('everything');
  const entries = entriesInDrive(
    flattenPages(query.data, (page) => page.entries),
    rootId,
  );
  if (query.data !== undefined && entries.length === 0) return null;
  return (
    <Section
      title="Quick access"
      action={
        <SectionAction
          label="See all"
          spoken="See all recent files"
          href={href.drivePage('recent')}
        />
      }
    >
      <RecentBody query={query} entries={entries} />
    </Section>
  );
}
