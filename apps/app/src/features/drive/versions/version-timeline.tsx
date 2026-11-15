import type { ReactElement, ReactNode } from 'react';
import { memo } from 'react';
import { View } from 'react-native';
import { FlashList, type ListRenderItem } from '@shopify/flash-list';
import { Badge } from '../../../components/badge';
import { Sparkline } from '../../../components/charts';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { Text } from '../../../components/text';
import { DRAW_DISTANCE } from '../../../components/virtual-list';
import { cn } from '../../../design/cn';
import { useIdiom } from '../../../design/platform';
import { bytes } from '../../../format/number';
import { initialsOf } from '../../../format/text';
import { useMinute } from '../../../store/clock';
import { useActiveProfile, useProfiles } from '../../../store/people';
import { sameJson } from '../../../store/same-json';
import { useSettings } from '../../../store/selectors';
import type { StoreState } from '../../../store/state';
import { useStoreSelector } from '../../../store/store-context';
import { SERIES_LOOK, VIA_LOOK } from '../activity/via-model';
import { useByName } from '../components/use-by-name';
import {
  CURRENT,
  byOf,
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
  readonly profileName: (profileId: string | null) => string | null;
}

function deviceLabelsIn(state: StoreState, deviceIds: readonly string[]): readonly string[] {
  return deviceIds.map((deviceId) => state.tables.devices.byId[deviceId]?.label ?? '');
}

function useProfileName(): TimelineLook['profileName'] {
  const names = new Map(useProfiles().map((profile) => [profile.id, profile.name] as const));
  return (profileId) => (profileId === null ? null : (names.get(profileId) ?? null));
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
    profileName: useProfileName(),
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
  const name = look.profileName(entry.authorId);
  const person = series === 'you' || series === 'people';
  return (
    <View
      aria-hidden
      className={cn('size-5 items-center justify-center rounded-full', SERIES_LOOK[series].mark)}
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
      className={cn('size-2 rounded-full', SERIES_LOOK[whoSeriesOf(entry, me)].fill)}
    />
  );
}

function WhenLine({
  entry,
  look,
  badge,
}: {
  readonly entry: VersionEntry;
  readonly look: TimelineLook;
  readonly badge: string | null;
}): ReactNode {
  return (
    <View className="min-w-0 flex-row items-center gap-2">
      <Text variant="body-strong" numberOfLines={1} className="tabular min-w-0 shrink">
        {whenOf(entry, look.time)}
      </Text>
      {entry.key === CURRENT ? <Badge label="Current" tone="positive" /> : null}
      {badge === null ? null : <Badge label={badge} tone="info" />}
    </View>
  );
}

function spokenOf(
  entry: VersionEntry,
  look: TimelineLook,
  slot: PickSlot | null,
  badge: string | null,
): string {
  const parts = [
    whenOf(entry, look.time),
    entry.key === CURRENT ? 'current' : null,
    badge,
    byOf(entry, look.namers),
    bytes(entry.bytes),
    slot === null ? null : `picked as ${slot.toUpperCase()}`,
  ];
  return parts.filter((part) => part !== null).join(', ');
}

function hintOf(slot: PickSlot | null, badge: string | null): string {
  if (badge !== null) return 'Compares this copy as B';
  return slot === 'b' ? 'Makes this version A' : 'Picks this version as B';
}

interface RowProps {
  readonly entry: VersionEntry;
  readonly slot: PickSlot | null;
  readonly look: TimelineLook;
  readonly onPick: (key: string) => void;
  readonly badge: string | null;
}

export const TimelineRow = memo(function TimelineRow({
  entry,
  slot,
  look,
  onPick,
  badge,
}: RowProps): ReactNode {
  return (
    <Interactive
      label={spokenOf(entry, look, slot, badge)}
      hint={hintOf(slot, badge)}
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
        <WhenLine entry={entry} look={look} badge={badge} />
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
      accessibilityLabel={spokenOf(entry, look, null, null)}
      className="h-row-h-2 flex-row items-center gap-3"
    >
      <View className="min-w-0 flex-1 gap-0.5">
        <WhenLine entry={entry} look={look} badge={null} />
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
  readonly total: string | null;
  readonly now: number;
}): ReactNode {
  const points = sizePoints(entries, now);
  return (
    <View className="gap-2 px-1.5 pb-2">
      <View className="flex-row items-baseline justify-between gap-3">
        <Text variant="footnote" tone="variant">
          Size over the last year
        </Text>
        {total === null ? null : (
          <Text variant="footnote" tone="variant" className="tabular">
            {total}
          </Text>
        )}
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

export interface PinnedEntry {
  readonly entry: VersionEntry;
  readonly badge: string;
}

export interface VersionTimelineProps {
  readonly entries: readonly VersionEntry[];
  readonly pinned?: PinnedEntry | null;
  readonly picks: VersionPicks;
  readonly onPick: (key: string) => void;
  readonly look: TimelineLook;
  readonly header?: ReactElement;
  readonly footer?: ReactElement;
}

export function VersionTimeline({
  entries,
  pinned = null,
  picks,
  onPick,
  look,
  header,
  footer,
}: VersionTimelineProps): ReactNode {
  const renderRow: ListRenderItem<VersionEntry> = ({ item }) => (
    <TimelineRow
      entry={item}
      slot={slotOf(picks, item.key)}
      look={look}
      onPick={onPick}
      badge={pinned !== null && pinned.entry.key === item.key ? pinned.badge : null}
    />
  );
  return (
    <FlashList<VersionEntry>
      data={pinned === null ? entries : [pinned.entry, ...entries]}
      extraData={picks}
      keyExtractor={(entry) => entry.key}
      renderItem={renderRow}
      drawDistance={DRAW_DISTANCE}
      {...(header === undefined ? {} : { ListHeaderComponent: header })}
      {...(footer === undefined ? {} : { ListFooterComponent: footer })}
    />
  );
}

export const COMPACT_CARD =
  'overflow-hidden rounded-lg border-hairline border-outline-variant bg-surface-1 px-4';

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
