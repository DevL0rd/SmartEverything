import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import type { DriveActivityEntry, DriveItem, DriveVia } from '@smarteverything/domain';
import { Button } from '../../../components/button';
import { ChoiceChip } from '../../../components/choice-chip';
import { FilterChip } from '../../../components/filter-chip';
import { dayText } from '../../../components/media-grid/day-text';
import type { SelectOption } from '../../../components/select-picker';
import { count } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { localDayKey, startOfDayKey } from '../../../format/time';
import { ChipRow } from '../../../components/library-frame/chip-row';
import {
  DRIVE_FILTERS,
  DRIVE_FILTER_LOOK,
  drivePathOf,
  type DriveChipKey,
  type DriveChipOf,
  type DriveFilter,
} from '../model/drive-chip';
import { EVERYONE_VALUE, PersonPicker, YOU_VALUE, type PersonOption } from './person-picker';
import { ViaChips } from './via-chips';
import {
  RANGE_LOOK,
  inRange,
  isChange,
  outsideOf,
  type ActivityEntry,
  type ActivityRange,
  type ActivityViewer,
} from './via-model';

export type ActivityKind = DriveItem['kind'];

export interface ActivityItem {
  readonly entry: ActivityEntry;
  readonly kind: ActivityKind | null;
  readonly drive: DriveChipKey;
}

export interface ActivityNames {
  readonly chipOf: DriveChipOf;
  readonly people: ReadonlyMap<string, string>;
  readonly devices: ReadonlyMap<string, string>;
}

function nameOf(names: ReadonlyMap<string, string>, id: string | null): string | null {
  return id === null ? null : (names.get(id) ?? null);
}

export function activityItemOf(feed: DriveActivityEntry, names: ActivityNames): ActivityItem {
  const { row, item } = feed;
  const chip = names.chipOf(row.rootId);
  return {
    kind: item?.kind ?? null,
    drive: chip.key,
    entry: {
      row,
      itemName: item?.name ?? 'Removed item',
      folderId: item?.parentId ?? null,
      folderPath: item === null ? 'Location unavailable' : drivePathOf(chip, item.relPath),
      actorName: nameOf(names.people, row.actorProfileId),
      deviceName: nameOf(names.devices, row.deviceId),
    },
  };
}

export interface FeedHead {
  readonly kind: 'head';
  readonly key: string;
  readonly title: string;
  readonly detail: string;
}

export interface FeedLine {
  readonly kind: 'line';
  readonly key: string;
  readonly entry: ActivityEntry;
}

export type FeedRow = FeedHead | FeedLine;

export function feedRowsOf(
  entries: readonly ActivityEntry[],
  zone: string | null,
  today: string,
): readonly FeedRow[] {
  const days = new Map<string, ActivityEntry[]>();
  const newest = [...entries].sort((first, second) => second.row.seq - first.row.seq);
  for (const entry of newest) {
    const day = localDayKey(entry.row.at, zone);
    const list = days.get(day) ?? [];
    list.push(entry);
    days.set(day, list);
  }
  return [...days].flatMap(([day, list]): FeedRow[] => [
    {
      kind: 'head',
      key: `head:${day}`,
      title: dayText(day, list.length, today).title,
      detail: plural(list.length, 'change'),
    },
    ...list.map((entry): FeedLine => ({ kind: 'line', key: String(entry.row.seq), entry })),
  ]);
}

export interface ActivityFilter {
  readonly person: string;
  readonly vias: ReadonlySet<DriveVia>;
  readonly drive: DriveFilter;
  readonly kind: ActivityKind | null;
  readonly folderKey: string | null;
}

export const NO_FILTER: ActivityFilter = {
  person: EVERYONE_VALUE,
  vias: new Set(),
  drive: 'all',
  kind: null,
  folderKey: null,
};

export function folderKeyOf(entry: ActivityEntry): string {
  return `${entry.row.rootId}/${entry.folderId ?? ''}`;
}

function personMatches(entry: ActivityEntry, person: string, me: string | null): boolean {
  if (person === EVERYONE_VALUE) return true;
  const actor = entry.row.actorProfileId;
  if (actor === null) return false;
  return person === YOU_VALUE ? actor === me : actor === person;
}

function placeMatches(item: ActivityItem, filter: ActivityFilter): boolean {
  return (
    (filter.drive === 'all' || item.drive === filter.drive) &&
    (filter.kind === null || item.kind === filter.kind)
  );
}

export function scopedItems(
  items: readonly ActivityItem[],
  filter: ActivityFilter,
): readonly ActivityItem[] {
  return items.filter((item) => placeMatches(item, filter));
}

export function filteredItems(
  items: readonly ActivityItem[],
  filter: ActivityFilter,
  me: string | null,
): readonly ActivityItem[] {
  return items.filter(
    (item) =>
      placeMatches(item, filter) &&
      personMatches(item.entry, filter.person, me) &&
      (filter.vias.size === 0 || filter.vias.has(item.entry.row.via)) &&
      (filter.folderKey === null || folderKeyOf(item.entry) === filter.folderKey),
  );
}

export function isFiltered(filter: ActivityFilter): boolean {
  return (
    filter.person !== EVERYONE_VALUE ||
    filter.vias.size > 0 ||
    filter.drive !== 'all' ||
    filter.kind !== null ||
    filter.folderKey !== null
  );
}

export function toggledVia(filter: ActivityFilter, via: DriveVia): ActivityFilter {
  const vias = new Set(filter.vias);
  if (vias.has(via)) vias.delete(via);
  else vias.add(via);
  return { ...filter, vias };
}

export function onlyOutside(filter: ActivityFilter): ActivityFilter {
  return { ...filter, vias: new Set<DriveVia>(['outside']) };
}

export function toggledFolder(filter: ActivityFilter, key: string): ActivityFilter {
  return { ...filter, folderKey: filter.folderKey === key ? null : key };
}

export function showsOnlyOutside(filter: ActivityFilter): boolean {
  return filter.vias.size === 1 && filter.vias.has('outside');
}

const YEAR_MONTHS = 12;

export function yearStartOf(now: number, zone: string | null): string {
  const month = new Date(startOfDayKey(`${localDayKey(now, zone).slice(0, 7)}-01`));
  return new Date(month.getFullYear(), month.getMonth() - YEAR_MONTHS + 1, 1).toISOString();
}

export interface ActivityView {
  readonly range: ActivityRange;
  readonly filter: ActivityFilter;
  readonly ranged: readonly ActivityItem[];
  readonly shown: readonly ActivityEntry[];
}

export function viewOf(
  items: readonly ActivityItem[],
  state: { readonly range: ActivityRange; readonly filter: ActivityFilter },
  viewer: ActivityViewer & { readonly now: number },
): ActivityView {
  const kept = new Set(
    inRange(
      items.map((item) => item.entry),
      state.range,
      viewer,
    ),
  );
  const ranged = items.filter((item) => kept.has(item.entry));
  const shown = filteredItems(ranged, state.filter, viewer.me).map((item) => item.entry);
  return { ...state, ranged, shown };
}

export function subtitleOf(ranged: readonly ActivityItem[], range: ActivityRange): string {
  const entries = ranged.map((item) => item.entry);
  const changes = entries.filter((entry) => isChange(entry.row)).length;
  const outside = outsideOf(entries).count;
  return joinParts([
    `${plural(changes, 'change')} ${RANGE_LOOK[range].phrase}`,
    outside === 0 ? null : `${count(outside)} outside the app`,
  ]);
}

export interface EmptyCopy {
  readonly title: string;
  readonly body: string;
  readonly action: 'clear' | 'year' | null;
  readonly label: string;
}

export function emptyCopyOf(filter: ActivityFilter, range: ActivityRange): EmptyCopy {
  const { phrase } = RANGE_LOOK[range];
  if (isFiltered(filter)) {
    return {
      title: 'Nothing matches these filters',
      body: `No changes ${phrase} match who, how, drive, folder and kind.`,
      action: 'clear',
      label: 'Clear filters',
    };
  }
  return {
    title: 'Nothing changed in this range',
    body: `No files were added, changed or removed ${phrase}.`,
    action: range === 'year' ? null : 'year',
    label: 'Show the year',
  };
}

const ALL = '*';

const KIND_OPTIONS: readonly SelectOption<ActivityKind | typeof ALL>[] = [
  { value: ALL, label: 'All kinds' },
  { value: 'folder', label: 'Folders' },
  { value: 'image', label: 'Images' },
  { value: 'video', label: 'Videos' },
  { value: 'document', label: 'Documents' },
  { value: 'audio', label: 'Audio' },
  { value: 'other', label: 'Other' },
];

export interface ActivityFiltersProps {
  readonly filter: ActivityFilter;
  readonly onChange: (filter: ActivityFilter) => void;
  readonly people: readonly PersonOption[];
  readonly me: string | null;
  readonly compact: boolean;
}

const DRIVE_OPTIONS: readonly SelectOption<DriveFilter>[] = DRIVE_FILTERS.map((drive) => ({
  value: drive,
  label: DRIVE_FILTER_LOOK[drive].label,
}));

function PlacePickers({ filter, onChange }: ActivityFiltersProps): ReactNode {
  return (
    <>
      <ChoiceChip
        label="Drive"
        icon={DRIVE_FILTER_LOOK[filter.drive].icon}
        options={DRIVE_OPTIONS}
        value={filter.drive}
        all="all"
        onChange={(picked) => {
          onChange({ ...filter, drive: picked });
        }}
      />
      <ChoiceChip
        label="Kind"
        icon="layers"
        options={KIND_OPTIONS}
        value={filter.kind ?? ALL}
        all={ALL}
        onChange={(picked) => {
          onChange({ ...filter, kind: picked === ALL ? null : picked });
        }}
      />
    </>
  );
}

function ClearButton({ filter, onChange }: ActivityFiltersProps): ReactNode {
  if (!isFiltered(filter)) return null;
  return (
    <Button
      label="Clear"
      variant="text"
      icon="close"
      onPress={() => {
        onChange(NO_FILTER);
      }}
    />
  );
}

function WhoAndHow(props: ActivityFiltersProps): ReactNode {
  const { filter, onChange } = props;
  return (
    <>
      <PersonPicker
        people={props.people}
        me={props.me}
        value={filter.person}
        onChange={(person) => {
          onChange({ ...filter, person });
        }}
      />
      <ViaChips
        vias={filter.vias}
        onAny={() => {
          onChange({ ...filter, vias: new Set() });
        }}
        onToggle={(via) => {
          onChange(toggledVia(filter, via));
        }}
      />
    </>
  );
}

function PhoneFilters(props: ActivityFiltersProps): ReactNode {
  const placed = props.filter.drive !== 'all' || props.filter.kind !== null;
  const [more, setMore] = useState(placed);
  const open = more || placed;
  return (
    <View className="gap-2">
      <ChipRow label="Activity filters">
        <WhoAndHow {...props} />
        <FilterChip
          label="Filters"
          value="More"
          icon="filter"
          affordance="menu"
          expanded={open}
          active={placed}
          onPress={() => {
            setMore(!open);
          }}
        />
      </ChipRow>
      {open ? (
        <View className="flex-row flex-wrap items-center gap-2">
          <PlacePickers {...props} />
          <ClearButton {...props} />
        </View>
      ) : null}
    </View>
  );
}

export function ActivityFilters(props: ActivityFiltersProps): ReactNode {
  if (props.compact) return <PhoneFilters {...props} />;
  return (
    <View className="flex-row flex-wrap items-center gap-2" accessibilityRole="toolbar">
      <WhoAndHow {...props} />
      <View className="min-w-0 flex-1" />
      <PlacePickers {...props} />
      <ClearButton {...props} />
    </View>
  );
}
