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
import { relative } from '../../../format/time';
import { useMinuteOf } from '../../../store/clock';
import { sameJson } from '../../../store/same-json';
import { useSession } from '../../../store/selectors';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { flattenPages, useDriveLink, useDriveRecent } from '../../nas/data';

export const OUTSIDE_CAPTION = 'changed outside SmartEverything';

const PLACEHOLDERS = ['a', 'b', 'c', 'd'] as const;

export interface RecentNames {
  readonly me: string | null;
  readonly people: Readonly<Record<string, string>>;
  readonly devices: Readonly<Record<string, string>>;
}

type Written = Extract<DriveRecentEntry, { readonly kind: 'added' | 'changed' }>;

const KIND_LOOK: Readonly<Record<DriveItem['kind'], { icon: IconName; colour: ColourRole }>> = {
  folder: { icon: 'folder', colour: 'viz-2' },
  image: { icon: 'image', colour: 'viz-1' },
  video: { icon: 'film', colour: 'viz-3' },
  audio: { icon: 'music', colour: 'viz-4' },
  document: { icon: 'fileText', colour: 'viz-6' },
  other: { icon: 'fileText', colour: 'on-surface-variant' },
};

const FIXED_ACTOR: Readonly<Partial<Record<Written['via'], string>>> = {
  ai: 'AI',
  automation: 'An automation',
  scan: 'Scan',
};

function actorOf(entry: Written, names: RecentNames): string {
  const fixed = FIXED_ACTOR[entry.via];
  if (fixed !== undefined) return fixed;
  const person = entry.actorProfileId;
  if (person !== null && person === names.me) return 'You';
  const name = person === null ? undefined : names.people[person];
  if (name !== undefined) return name;
  if (entry.via === 'share') return 'Someone with a link';
  const device = entry.deviceId === null ? undefined : names.devices[entry.deviceId];
  return device ?? 'Someone';
}

export function recentCaptionOf(entry: DriveRecentEntry, names: RecentNames, now: number): string {
  const when = relative(entry.at, now);
  if (entry.kind === 'opened') return `Opened · ${when}`;
  if (entry.via === 'outside') return `${OUTSIDE_CAPTION} · ${when}`;
  return `${actorOf(entry, names)} · ${when}`;
}

export function recentKeyOf(entry: DriveRecentEntry): string {
  return `${entry.kind}\n${entry.item.id}\n${entry.at}`;
}

function idsOf(entries: readonly DriveRecentEntry[]): {
  readonly people: readonly string[];
  readonly devices: readonly string[];
} {
  const written = entries.filter((entry): entry is Written => entry.kind !== 'opened');
  return {
    people: [...new Set(written.flatMap((entry) => entry.actorProfileId ?? []))],
    devices: [...new Set(written.flatMap((entry) => entry.deviceId ?? []))],
  };
}

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
  const me = useSession().client.profile_id;
  const { people, devices } = idsOf(entries);
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
    <View className="h-21 items-start justify-end overflow-hidden bg-surface-3 p-2.5">
      {url === null ? null : (
        <Image
          source={{ uri: url, cacheKey: `${item.id}:${String(item.rev)}` }}
          contentFit="cover"
          cachePolicy="disk"
          style={StyleSheet.absoluteFill}
          accessible={false}
        />
      )}
      <IconWell icon={look.icon} colour={look.colour} size="s" />
    </View>
  );
}

function RecentTile({
  entry,
  names,
}: {
  readonly entry: DriveRecentEntry;
  readonly names: RecentNames;
}): ReactNode {
  const caption = useMinuteOf((now) => recentCaptionOf(entry, names, now));
  const { item } = entry;
  return (
    <Interactive
      href={href.driveRoot(item.rootId, {
        ...(item.parentId === null ? {} : { folder: item.parentId }),
        item: item.id,
      })}
      label={`${item.name}, ${caption}`}
      className="w-40 overflow-hidden rounded-md border-hairline border-outline-variant bg-surface-1"
      layerClassName="rounded-md"
    >
      <Thumb item={item} />
      <View className="gap-0.5 px-2.5 py-2">
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
        <Skeleton key={key} shape="tile" className="h-32 w-40" />
      ))}
    </View>
  );
}

function RecentTiles({ entries }: { readonly entries: readonly DriveRecentEntry[] }): ReactNode {
  const names = useRecentNames(entries);
  return (
    <HScroller label="Recent files" fade fadeSurface="bg">
      {entries.map((entry) => (
        <RecentTile key={recentKeyOf(entry)} entry={entry} names={names} />
      ))}
    </HScroller>
  );
}

function RecentBody({ query }: { readonly query: ReturnType<typeof useDriveRecent> }): ReactNode {
  const entries = flattenPages(query.data, (page) => page.entries);
  if (query.data !== undefined) return <RecentTiles entries={entries} />;
  if (query.isError) {
    return (
      <ErrorState
        error={query.error}
        retry={() => {
          background(query.refetch(), 'drive.recent_refetch_failed');
        }}
      />
    );
  }
  return <RecentSkeleton />;
}

export function QuickRecentRow(): ReactNode {
  const query = useDriveRecent('everything');
  const empty = query.data?.pages.every((page) => page.entries.length === 0) === true;
  if (empty) return null;
  return (
    <Section
      title="Recent"
      action={
        <SectionAction
          label="See all"
          spoken="See all recent files"
          href={href.drivePage('recent')}
        />
      }
    >
      <RecentBody query={query} />
    </Section>
  );
}
