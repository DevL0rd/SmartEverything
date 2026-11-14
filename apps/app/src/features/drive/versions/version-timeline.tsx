import type { ReactElement, ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import type { DriveRoot } from '@smarteverything/domain';
import { Badge } from '../../../components/badge';
import { Sparkline } from '../../../components/charts';
import { EmptyState } from '../../../components/empty-state';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Skeleton } from '../../../components/skeleton';
import { Text } from '../../../components/text';
import { DRAW_DISTANCE } from '../../../components/virtual-list';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { bytes } from '../../../format/number';
import { initialsOf } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { useActiveProfile } from '../../../store/people';
import { sameJson } from '../../../store/same-json';
import { useSettings } from '../../../store/selectors';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { SERIES_LOOK, VIA_LOOK } from '../activity/via-model';
import { useByName } from '../folder/folder-list';
import {
  CURRENT,
  byOf,
  seriesOfEntry,
  sizePoints,
  slotOf,
  whenOf,
  whoSeriesOf,
  type Clock,
  type Namers,
  type PickSlot,
  type VersionEntry,
  type VersionPicks,
} from './versions-model';

export interface TimelineLook {
  readonly namers: Namers;
  readonly time: Clock;
  readonly me: string | null;
  readonly pointer: boolean;
}

function deviceLabelsIn(state: StoreState, deviceIds: readonly string[]): readonly string[] {
  return deviceIds.map((deviceId) => state.tables.devices.byId[deviceId]?.label ?? '');
}

function useDeviceName(entries: readonly VersionEntry[]): Namers['deviceName'] {
  const deviceIds = [
    ...new Set(entries.flatMap((entry) => (entry.deviceId === null ? [] : [entry.deviceId]))),
  ];
  const labels = useStoreSelector((state) => deviceLabelsIn(state, deviceIds), sameJson, [
    deviceIds.join('\n'),
  ]);
  const names = new Map(deviceIds.map((deviceId, index) => [deviceId, labels[index] ?? '']));
  return (deviceId) => {
    const name = names.get(deviceId);
    return name === undefined || name === '' ? null : name;
  };
}

export function useTimelineLook(entries: readonly VersionEntry[]): TimelineLook {
  const byName = useByName();
  const deviceName = useDeviceName(entries);
  const now = useMinute();
  const zone = useSettings().time_zone;
  return {
    namers: { byName, deviceName },
    time: { now, zone },
    me: useActiveProfile()?.id ?? null,
    pointer: useIdiom() === 'pointer',
  };
}

export function PickKey({
  slot,
  pointer,
}: {
  readonly slot: PickSlot | null;
  readonly pointer: boolean;
}): ReactNode {
  return (
    <View
      aria-hidden
      className={cn(
        'items-center justify-center rounded-xs',
        pointer ? 'size-6' : 'size-7',
        slot === 'a' && 'bg-primary',
        slot === 'b' && 'border border-primary',
      )}
    >
      {slot === null ? null : (
        <Text variant="label" tone={slot === 'a' ? 'onPrimary' : 'primary'}>
          {slot === 'a' ? 'A' : 'B'}
        </Text>
      )}
    </View>
  );
}

function AuthorMark({
  entry,
  look,
}: {
  readonly entry: VersionEntry;
  readonly look: TimelineLook;
}): ReactNode {
  const series = whoSeriesOf(entry, look.me);
  const name = look.namers.byName(entry.authorId);
  const person = series === 'you' || series === 'people';
  return (
    <View
      aria-hidden
      className={cn('size-5 items-center justify-center rounded-full', SERIES_LOOK[series].fill)}
    >
      {person && name !== null ? (
        <Text variant="caption" tone="onPrimary">
          {initialsOf(name)}
        </Text>
      ) : (
        <Icon
          name={entry.via === null ? 'user' : VIA_LOOK[entry.via].icon}
          size={12}
          tone="onPrimary"
        />
      )}
    </View>
  );
}

function ViaDot({
  entry,
  me,
}: {
  readonly entry: VersionEntry;
  readonly me: string | null;
}): ReactNode {
  return (
    <View
      aria-hidden
      className={cn('size-2 rounded-full', SERIES_LOOK[seriesOfEntry(entry, me)].fill)}
    />
  );
}

function WhenLine({
  entry,
  look,
}: {
  readonly entry: VersionEntry;
  readonly look: TimelineLook;
}): ReactNode {
  return (
    <View className="min-w-0 flex-row items-center gap-2">
      <Text variant="body-strong" numberOfLines={1} className="tabular min-w-0 shrink">
        {whenOf(entry, look.time)}
      </Text>
      {entry.key === CURRENT ? <Badge label="Current" tone="positive" /> : null}
    </View>
  );
}

function spokenOf(entry: VersionEntry, look: TimelineLook, slot: PickSlot | null): string {
  const parts = [
    whenOf(entry, look.time),
    entry.key === CURRENT ? 'current' : null,
    byOf(entry, look.namers),
    bytes(entry.bytes),
    slot === null ? null : `picked as ${slot.toUpperCase()}`,
  ];
  return parts.filter((part) => part !== null).join(', ');
}

interface RowProps {
  readonly entry: VersionEntry;
  readonly slot: PickSlot | null;
  readonly look: TimelineLook;
  readonly onPick: (key: string) => void;
}

export const TimelineRow = memo(function TimelineRow({
  entry,
  slot,
  look,
  onPick,
}: RowProps): ReactNode {
  return (
    <Interactive
      label={spokenOf(entry, look, slot)}
      hint={slot === 'b' ? 'Makes this version A' : 'Picks this version as B'}
      selected={slot !== null}
      onPress={() => {
        onPick(entry.key);
      }}
      className={cn(
        'h-row-h-2 flex-row items-center gap-3 rounded-sm px-3',
        slot === 'a' && 'bg-primary/12',
        slot === 'b' && 'border border-primary',
      )}
    >
      <PickKey slot={slot} pointer={look.pointer} />
      <View className="min-w-0 flex-1 gap-0.5">
        <WhenLine entry={entry} look={look} />
        <View className="min-w-0 flex-row items-center gap-1.5">
          <AuthorMark entry={entry} look={look} />
          <Text variant="callout" tone="variant" numberOfLines={1} className="min-w-0 shrink">
            {byOf(entry, look.namers)}
          </Text>
        </View>
      </View>
      <Text variant="callout" tone="variant" className="tabular shrink-0">
        {bytes(entry.bytes)}
      </Text>
    </Interactive>
  );
});

export function CompactRow({
  entry,
  look,
}: {
  readonly entry: VersionEntry;
  readonly look: TimelineLook;
}): ReactNode {
  return (
    <View
      accessible
      accessibilityLabel={spokenOf(entry, look, null)}
      className="h-row-h-2 flex-row items-center gap-3"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <WhenLine entry={entry} look={look} />
        <View className="min-w-0 flex-row items-center gap-2">
          <ViaDot entry={entry} me={look.me} />
          <Text variant="callout" tone="variant" numberOfLines={1} className="min-w-0 shrink">
            {byOf(entry, look.namers)}
          </Text>
        </View>
      </View>
      <Text variant="callout" tone="variant" className="tabular shrink-0">
        {bytes(entry.bytes)}
      </Text>
    </View>
  );
}

export function SizeOverYear({
  entries,
  total,
  now,
}: {
  readonly entries: readonly VersionEntry[];
  readonly total: string;
  readonly now: number;
}): ReactNode {
  const points = sizePoints(entries, now);
  return (
    <View className="gap-2 px-1.5 pb-2">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="footnote" tone="variant">
          Size over the last year
        </Text>
        <Text variant="footnote" tone="variant" className="tabular">
          {total}
        </Text>
      </View>
      {points.length < 2 ? null : (
        <View
          accessible
          accessibilityRole="image"
          accessibilityLabel="Size of each version over the last year"
        >
          <Sparkline points={points} colour="primary" height={36} />
        </View>
      )}
    </View>
  );
}

export interface VersionTimelineProps {
  readonly entries: readonly VersionEntry[];
  readonly picks: VersionPicks;
  readonly onPick: (key: string) => void;
  readonly look: TimelineLook;
  readonly header?: ReactElement;
  readonly footer?: ReactElement;
}

export function VersionTimeline({
  entries,
  picks,
  onPick,
  look,
  header,
  footer,
}: VersionTimelineProps): ReactNode {
  const renderRow: ListRenderItem<VersionEntry> = ({ item }) => (
    <TimelineRow entry={item} slot={slotOf(picks, item.key)} look={look} onPick={onPick} />
  );
  return (
    <FlashList<VersionEntry>
      data={entries}
      extraData={picks}
      keyExtractor={(entry) => entry.key}
      renderItem={renderRow}
      drawDistance={DRAW_DISTANCE}
      {...(header === undefined ? {} : { ListHeaderComponent: header })}
      {...(footer === undefined ? {} : { ListFooterComponent: footer })}
    />
  );
}

export function CompactTimeline({
  entries,
  look,
}: {
  readonly entries: readonly VersionEntry[];
  readonly look: TimelineLook;
}): ReactNode {
  return (
    <View role="list" aria-label="Versions">
      {entries.map((entry, index) => (
        <View key={entry.key} className={index === 0 ? '' : 'border-t border-outline-variant'}>
          <CompactRow entry={entry} look={look} />
        </View>
      ))}
    </View>
  );
}

const SKELETON_ROWS = ['a', 'b', 'c', 'd'] as const;

export function TimelineLoading(): ReactNode {
  return (
    <View aria-label="Loading versions" className="gap-2 p-3">
      {SKELETON_ROWS.map((key) => (
        <View key={key} className="h-row-h-2 flex-row items-center gap-3">
          <Skeleton shape="circle" className="size-6 rounded-xs" />
          <View className="flex-1 gap-2">
            <Skeleton shape="text" className="w-32" />
            <Skeleton shape="text" />
          </View>
        </View>
      ))}
    </View>
  );
}

export function OneVersion({ root }: { readonly root: DriveRoot }): ReactNode {
  return root.versions ? (
    <EmptyState
      compact
      icon="layers"
      title="One version so far"
      body="When this file changes, the old copy is kept here for a year."
    />
  ) : (
    <EmptyState
      compact
      icon="layers"
      title="Versions are off"
      body="Earlier copies of files in this drive are not kept. Versions in Drive settings keeps them, and they use space."
    />
  );
}
