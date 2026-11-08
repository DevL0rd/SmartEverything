import type { PlannerCollectionRow } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { ColourSwatches } from '../../../components/colour-swatches';
import { EmptyState } from '../../../components/empty-state';
import { FilterChip } from '../../../components/filter-chip';
import { Icon } from '../../../components/icon';
import { Interactive } from '../../../components/interactive';
import { ListRow } from '../../../components/list-row';
import { SelectRow } from '../../../components/rows';
import { Sheet } from '../../../components/sheet';
import { Text } from '../../../components/text';
import { notify } from '../../../components/toast-store';
import { cn } from '../../../design/cn';
import { usePlannerCollections, usePlannerWrites } from '../data';
import type { CollectionChange } from '../data/writes';
import { usePlannerFrame } from '../frame/frame-context';
import { LIST_DOT } from '../item/composer-tokens';
import {
  CALENDAR_SHOWS,
  type CalendarShowKey,
  COLOUR_OPTIONS,
  NONE,
  beforeText,
  reminderOptions,
} from '../settings/options';
import { useSavePrefs, type Prefs } from '../settings/preferences';

export function shownCalendarsOf(
  collections: readonly PlannerCollectionRow[],
): readonly string[] | null {
  return collections.every((row) => row.visible)
    ? null
    : collections.filter((row) => row.visible).map((row) => row.id);
}

export function sourceText(row: PlannerCollectionRow): string {
  return row.source === 'google' ? 'Google' : 'This hub';
}

export function remindersText(row: PlannerCollectionRow): string {
  if (row.default_reminders.length === 0) return 'None';
  return row.default_reminders.map((reminder) => beforeText(reminder.minutes_before)).join(', ');
}

export function reminderValue(row: PlannerCollectionRow): string {
  const first = row.default_reminders[0];
  return first === undefined ? NONE : String(first.minutes_before);
}

export function remindersOf(value: string): CollectionChange {
  return { default_reminders: value === NONE ? [] : [{ minutes_before: Number(value) }] };
}

export type CollectionEdit = (row: PlannerCollectionRow, change: CollectionChange) => void;

export function useCollectionEdit(): CollectionEdit {
  const writes = usePlannerWrites(usePlannerFrame().person);
  return (row, change) => {
    writes.updateCollection(row, change).catch((error: unknown) => {
      notify({ message: `${row.name} was not changed`, error, tone: 'critical' });
    });
  };
}

export function showChange(key: CalendarShowKey, on: boolean): Partial<Prefs['calendar']> {
  switch (key) {
    case 'show_tasks':
      return { show_tasks: on };
    case 'show_alarms':
      return { show_alarms: on };
    case 'show_sleep':
      return { show_sleep: on };
    case 'show_free_time':
      return { show_free_time: on };
  }
}

export function useFlipShow(): (key: CalendarShowKey) => void {
  const save = useSavePrefs('Show on the calendar');
  return (key) => {
    save((current) => ({ calendar: showChange(key, !current.calendar[key]) }));
  };
}

export function ShowChips({
  prefs,
  keys,
}: {
  readonly prefs: Prefs;
  readonly keys: readonly CalendarShowKey[];
}): ReactNode {
  const flip = useFlipShow();
  return CALENDAR_SHOWS.filter((show) => keys.includes(show.key)).map((show) => (
    <FilterChip
      key={show.key}
      label="Show on the calendar"
      value={show.title}
      icon={show.icon}
      active={prefs.calendar[show.key]}
      onPress={() => {
        flip(show.key);
      }}
    />
  ));
}

type Change = CollectionEdit;

function ShownMark({
  row,
  onChange,
}: {
  readonly row: PlannerCollectionRow;
  readonly onChange: Change;
}): ReactNode {
  return (
    <Interactive
      role="checkbox"
      checked={row.visible}
      label={`Show ${row.name}`}
      onPress={() => {
        onChange(row, { visible: !row.visible });
      }}
      className="min-h-touch-min min-w-touch-min items-center justify-center rounded-full"
      layerClassName="rounded-full"
    >
      <View
        className={cn(
          'size-5 items-center justify-center rounded-xs border-2',
          row.visible
            ? cn('border-transparent', LIST_DOT[row.colour])
            : 'border-on-surface-variant',
        )}
      >
        {row.visible ? <Icon name="check" size={16} tone="onPrimary" /> : null}
      </View>
    </Interactive>
  );
}

function CalendarDetail({
  row,
  onChange,
}: {
  readonly row: PlannerCollectionRow;
  readonly onChange: Change;
}): ReactNode {
  return (
    <View className="mx-4 mb-2 gap-2 rounded-md bg-surface-2 px-3 py-2.5">
      <Text variant="caption" tone="variant">
        {`${row.name} · colour`}
      </Text>
      <ColourSwatches
        label={`${row.name} colour`}
        value={row.colour}
        options={COLOUR_OPTIONS}
        onChange={(colour) => {
          onChange(row, { colour });
        }}
      />
      <SelectRow
        title="Default reminder"
        icon="bell"
        options={reminderOptions(reminderValue(row))}
        value={reminderValue(row)}
        onChange={(value) => {
          onChange(row, remindersOf(value));
        }}
      />
    </View>
  );
}

function CalendarRow({
  row,
  open,
  onOpen,
  onChange,
}: {
  readonly row: PlannerCollectionRow;
  readonly open: boolean;
  readonly onOpen: () => void;
  readonly onChange: Change;
}): ReactNode {
  return (
    <View>
      <ListRow
        leading={<ShownMark row={row} onChange={onChange} />}
        title={row.name}
        subtitle={sourceText(row)}
        value={remindersText(row)}
        chevron
        expanded={open}
        label={`${row.name}, ${sourceText(row)}, reminder ${remindersText(row)}`}
        onPress={onOpen}
      />
      {open ? <CalendarDetail row={row} onChange={onChange} /> : null}
    </View>
  );
}

function CalendarList(): ReactNode {
  const calendars = usePlannerCollections(usePlannerFrame().person).filter(
    (row) => row.kind === 'calendar',
  );
  const onChange = useCollectionEdit();
  const [opened, setOpened] = useState<string | null>(null);
  if (calendars.length === 0) {
    return (
      <EmptyState
        icon="calendar"
        title="No calendars yet"
        body="Calendars from Google and the ones made here show up in this list."
      />
    );
  }
  return calendars.map((row) => (
    <CalendarRow
      key={row.id}
      row={row}
      open={opened === row.id}
      onOpen={() => {
        setOpened(opened === row.id ? null : row.id);
      }}
      onChange={onChange}
    />
  ));
}

const SHOW_KEYS = CALENDAR_SHOWS.map((show) => show.key);

export interface CalendarsSheetProps {
  readonly open: boolean;
  readonly onClose: () => void;
  readonly prefs: Prefs;
}

export function CalendarsSheet({ open, onClose, prefs }: CalendarsSheetProps): ReactNode {
  return (
    <Sheet open={open} onClose={onClose} title="Calendars" detents={['fit']}>
      {open ? (
        <View className="gap-2 pb-2">
          <CalendarList />
          <View className="mx-4 h-hairline bg-outline-variant" />
          <View className="gap-2 px-4">
            <Text variant="caption" tone="variant">
              Show on the calendar
            </Text>
            <View className="flex-row flex-wrap items-center gap-1">
              <ShowChips prefs={prefs} keys={SHOW_KEYS} />
            </View>
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}
