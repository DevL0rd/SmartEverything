import type { PlannerCollectionRow, PlannerItemRow, ProfileRow } from '@smarteverything/domain';
import { useState, type ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { ListRow } from '../../../components/list-row';
import { SelectRow, ValueRow } from '../../../components/rows';
import { List } from '../../../components/section';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import { TextField } from '../../../components/text-field';
import { duration } from '../../../format/time';
import { AssigneeField } from './item-assignee';
import type { FieldsToday } from './item-history';
import { OutlinedChip } from './outlined-chip';
import {
  NO_REPEAT,
  repeatChangeOf,
  repeatOptionsOf,
  repeatTextOf,
  type ItemChanges,
} from './repeat-scope-bar';
import { WhenRow } from './when-row';

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

function unitText(amount: number, one: string): string {
  return `${String(amount)} ${one}${amount === 1 ? '' : 's'}`;
}

function spanText(minutes: number): string {
  if (minutes % 1440 === 0) return unitText(minutes / 1440, 'day');
  if (minutes % 60 === 0) return unitText(minutes / 60, 'hour');
  return unitText(minutes, 'minute');
}

export function reminderTextOf(minutes: number): string {
  return minutes === 0 ? 'At the time' : `${spanText(minutes)} before`;
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
  readonly profiles: readonly ProfileRow[];
  readonly me: string | null;
  readonly whenCaption: string | null;
  readonly reminderCaption: string | null;
  readonly openWhen: boolean;
  readonly disabled: boolean;
  readonly onChange: (changes: ItemChanges) => void;
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
        <OutlinedChip
          key={tag}
          label={`#${tag}`}
          spoken={`Remove tag ${tag}`}
          icon="hash"
          trailing="close"
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
        placeholder="New tag"
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

function CollectionField(props: ItemFieldsProps): ReactNode {
  const { item, collections, disabled, onChange } = props;
  const kind = item.kind === 'event' ? 'calendar' : 'list';
  const title = kind === 'calendar' ? 'Calendar' : 'List';
  if (!collections.some((row) => row.id === item.collection_id))
    return <ValueRow wrapTitle title={title} icon="list" value={`${props.personName}’s ${kind}`} />;
  return (
    <SelectRow
      wrapTitle
      title={title}
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

function OwnerRow({ item, me, personName }: ItemFieldsProps): ReactNode {
  if (item.profile_id === me) {
    return <ValueRow wrapTitle title="For" icon="user" value={personName} />;
  }
  if (item.kind === 'task') return null;
  return <ValueRow wrapTitle title="Organiser" icon="user" value={personName} />;
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
      <OwnerRow {...props} />
      <AssigneeField
        item={props.item}
        profiles={props.profiles}
        me={props.me}
        disabled={props.disabled}
        onChange={props.onChange}
      />
    </List>
  );
}
