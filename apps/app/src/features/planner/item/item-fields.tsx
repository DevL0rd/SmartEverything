import type { PlannerCollectionRow, PlannerItemRow } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { FilterChip } from '../../../components/filter-chip';
import { ListRow } from '../../../components/list-row';
import { SelectRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { TextField } from '../../../components/text-field';
import { TimeField } from '../../../components/time-field';
import { duration } from '../../../format/time';
import {
  timeOfLocal,
  whenTextOf,
  withEndTime,
  withStartTime,
  type FieldsToday,
} from './item-history';
import {
  NO_REPEAT,
  repeatChangeOf,
  repeatOptionsOf,
  repeatTextOf,
  type ItemChanges,
} from './repeat-scope-bar';

const ESTIMATES = [5, 10, 15, 20, 30, 45, 60, 90, 120, 180, 240] as const;

const REMINDERS = [0, 5, 10, 15, 30, 60, 120, 1440] as const;

const NONE = 'none';

function minutesText(minutes: number): string {
  return duration(minutes * 60);
}

export function estimateOptionsOf(
  current: number | null,
): readonly { value: string; label: string }[] {
  const minutes: readonly number[] =
    current === null || ESTIMATES.some((value) => value === current)
      ? ESTIMATES
      : [current, ...ESTIMATES];
  return [
    { value: NONE, label: 'No estimate' },
    ...[...minutes]
      .sort((a, b) => a - b)
      .map((value) => ({ value: String(value), label: minutesText(value) })),
  ];
}

export function reminderTextOf(minutes: number): string {
  return minutes === 0 ? 'At the time' : `${minutesText(minutes)} before`;
}

export function remindersTextOf(reminders: PlannerItemRow['reminders']): string {
  if (reminders.length === 0) return 'None';
  return [...reminders]
    .sort((a, b) => a.minutes_before - b.minutes_before)
    .map((reminder) => reminderTextOf(reminder.minutes_before))
    .join(', ');
}

export function toggledReminders(
  reminders: PlannerItemRow['reminders'],
  value: string,
): NonNullable<ItemChanges['reminders']> {
  if (value === NONE) return [];
  const minutes = Number(value);
  const set = reminders.some((reminder) => reminder.minutes_before === minutes);
  return set
    ? reminders.filter((reminder) => reminder.minutes_before !== minutes)
    : [...reminders, { minutes_before: minutes }];
}

function reminderOptionsOf(
  reminders: PlannerItemRow['reminders'],
): readonly { value: string; label: string; description?: string }[] {
  const minutes = new Set<number>([
    ...REMINDERS,
    ...reminders.map((reminder) => reminder.minutes_before),
  ]);
  return [
    { value: NONE, label: 'No reminders' },
    ...[...minutes]
      .sort((a, b) => a - b)
      .map((value) => {
        const on = reminders.some((reminder) => reminder.minutes_before === value);
        return {
          value: String(value),
          label: reminderTextOf(value),
          ...(on ? { description: 'On · pick to turn off' } : {}),
        };
      }),
  ];
}

export function tagOf(text: string): string | null {
  const tag = text.trim().replace(/^#+/, '').trim();
  return tag === '' ? null : tag;
}

export interface ItemFieldsProps {
  readonly item: PlannerItemRow;
  readonly collections: readonly PlannerCollectionRow[];
  readonly today: FieldsToday;
  readonly personName: string;
  readonly whenCaption: string | null;
  readonly reminderCaption: string | null;
  readonly disabled: boolean;
  readonly onChange: (changes: ItemChanges) => void;
}

function WhenRow({ item, today, whenCaption, onChange }: ItemFieldsProps): ReactNode {
  const [open, setOpen] = useState(false);
  const start = item.start_local;
  const timed = start?.includes('T') ?? false;
  return (
    <View>
      <ListRow
        wrapTitle
        title="When"
        icon="clock"
        value={whenTextOf(item, today)}
        {...(whenCaption === null ? {} : { caption: whenCaption })}
        {...(timed
          ? {
              chevron: true,
              expanded: open,
              onPress: (): void => {
                setOpen(!open);
              },
            }
          : {})}
      />
      {open && start !== null && timed ? (
        <View className="flex-row flex-wrap gap-4 px-4 pb-3">
          <TimeField
            label="Starts"
            value={timeOfLocal(start)}
            onChange={(time) => {
              onChange(withStartTime(item, time));
            }}
          />
          {item.end_local === null ? null : (
            <TimeField
              label="Ends"
              value={timeOfLocal(item.end_local)}
              onChange={(time) => {
                onChange(withEndTime(item, time));
              }}
            />
          )}
        </View>
      ) : null}
    </View>
  );
}

type PriorityValue = 'none' | '1' | '2' | '3';

const PRIORITY_OPTIONS: readonly SegmentedOption<PriorityValue>[] = [
  { value: 'none', label: 'None', spoken: 'No priority' },
  { value: '1', label: '1', spoken: 'Priority 1' },
  { value: '2', label: '2', spoken: 'Priority 2' },
  { value: '3', label: '3', spoken: 'Priority 3' },
];

export function priorityValueOf(priority: number | null): PriorityValue {
  if (priority === 1) return '1';
  if (priority === 2) return '2';
  return priority === 3 ? '3' : 'none';
}

function PriorityRow({ item, disabled, onChange }: ItemFieldsProps): ReactNode {
  return (
    <ListRow
      wrapTitle
      title="Priority"
      icon="flag"
      trailing={
        <Segmented
          options={PRIORITY_OPTIONS}
          value={priorityValueOf(item.priority)}
          onChange={(value) => {
            onChange({ priority: value === 'none' ? null : Number(value) });
          }}
          label="Priority"
          disabled={disabled}
          compact
        />
      }
    />
  );
}

function TagChips({ item, disabled, onChange }: ItemFieldsProps): ReactNode {
  if (item.tags.length === 0) return null;
  return (
    <View className="flex-row flex-wrap gap-2 px-4">
      {item.tags.map((tag) => (
        <FilterChip
          key={tag}
          label="Remove tag"
          value={`#${tag}`}
          active
          affordance="remove"
          disabled={disabled}
          onPress={() => {
            onChange({ tags: item.tags.filter((other) => other !== tag) });
          }}
        />
      ))}
    </View>
  );
}

function NewTag({
  item,
  onChange,
  onDone,
}: ItemFieldsProps & { readonly onDone: () => void }): ReactNode {
  const [text, setText] = useState('');
  const add = (): void => {
    const tag = tagOf(text);
    if (tag !== null && !item.tags.includes(tag)) onChange({ tags: [...item.tags, tag] });
    setText('');
    onDone();
  };
  return (
    <View className="px-4">
      <TextField
        label="New tag"
        value={text}
        onChange={setText}
        onSubmit={add}
        onBlur={add}
        placeholder="fitness"
        focusOnMount
        showLabel={false}
      />
    </View>
  );
}

function TagsRow(props: ItemFieldsProps): ReactNode {
  const [adding, setAdding] = useState(false);
  return (
    <View className="gap-2 pb-2">
      <ListRow
        wrapTitle
        title="Tags"
        icon="hash"
        {...(props.item.tags.length === 0 ? { value: 'None' } : {})}
        trailing={
          <Button
            label="Tag"
            icon="plus"
            variant="text"
            disabled={props.disabled}
            onPress={() => {
              setAdding(true);
            }}
          />
        }
      />
      <TagChips {...props} />
      {adding ? (
        <NewTag
          {...props}
          onDone={() => {
            setAdding(false);
          }}
        />
      ) : null}
    </View>
  );
}

function RepeatField({ item, disabled, onChange }: ItemFieldsProps): ReactNode {
  const repeat = repeatOptionsOf(item);
  if (repeat.length === 0) {
    return <ValueRow wrapTitle title="Repeat" icon="repeat" value={repeatTextOf(item.rrule)} />;
  }
  return (
    <SelectRow
      wrapTitle
      title="Repeat"
      icon="repeat"
      options={repeat}
      value={item.rrule ?? NO_REPEAT}
      disabled={disabled}
      onChange={(value) => {
        onChange(repeatChangeOf(value));
      }}
    />
  );
}

function CollectionField({ item, collections, disabled, onChange }: ItemFieldsProps): ReactNode {
  const kind = item.kind === 'event' ? 'calendar' : 'list';
  return (
    <SelectRow
      wrapTitle
      title={kind === 'calendar' ? 'Calendar' : 'List'}
      icon="list"
      options={collections
        .filter((row) => row.kind === kind)
        .map((row) => ({ value: row.id, label: row.name }))}
      value={item.collection_id}
      disabled={disabled}
      onChange={(value) => {
        onChange({ collection_id: value });
      }}
    />
  );
}

function EstimateField({ item, disabled, onChange }: ItemFieldsProps): ReactNode {
  return (
    <SelectRow
      wrapTitle
      title="Estimate"
      icon="timer"
      options={estimateOptionsOf(item.estimate_minutes)}
      value={item.estimate_minutes === null ? NONE : String(item.estimate_minutes)}
      disabled={disabled}
      onChange={(value) => {
        onChange({ estimate_minutes: value === NONE ? null : Number(value) });
      }}
    />
  );
}

export function reminderSummaryOf(reminders: PlannerItemRow['reminders']): {
  readonly value: string;
  readonly list: string | null;
} {
  if (reminders.length <= 2) return { value: remindersTextOf(reminders), list: null };
  return { value: `${String(reminders.length)} reminders`, list: remindersTextOf(reminders) };
}

function ReminderField({ item, disabled, reminderCaption, onChange }: ItemFieldsProps): ReactNode {
  const summary = reminderSummaryOf(item.reminders);
  return (
    <SelectRow
      wrapTitle
      title="Remind me"
      icon="bell"
      options={reminderOptionsOf(item.reminders)}
      value={null}
      placeholder={summary.value}
      {...(summary.list === null ? {} : { subtitle: summary.list, wrapSubtitle: true })}
      {...(reminderCaption === null ? {} : { caption: reminderCaption })}
      disabled={disabled}
      onChange={(value) => {
        onChange({ reminders: toggledReminders(item.reminders, value) });
      }}
    />
  );
}

export function ItemFields(props: ItemFieldsProps): ReactNode {
  return (
    <List>
      <WhenRow {...props} />
      <RepeatField {...props} />
      <CollectionField {...props} />
      <PriorityRow {...props} />
      <TagsRow {...props} />
      <EstimateField {...props} />
      <ReminderField {...props} />
      <ValueRow wrapTitle title="For" icon="user" value={props.personName} />
    </List>
  );
}
