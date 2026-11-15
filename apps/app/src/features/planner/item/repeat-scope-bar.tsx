import {
  PLANNER_RRULE_WEEKDAYS,
  parsePlannerRrule,
  type PlannerItemRow,
  type PlannerItemScope,
  type PlannerRrule,
} from '@smarteverything/domain';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import { Button } from '../../../components/button';
import { Segmented, type SegmentedOption } from '../../../components/segmented';
import type { SelectOption } from '../../../components/select';
import { Text } from '../../../components/text';
import { useIdiom } from '../../../design/platform';
import { longDate } from '../../../format/time';
import type { ItemChange } from '../data/writes';

export type ItemChanges = ItemChange['changes'];

type PlannerRruleWeekday = (typeof PLANNER_RRULE_WEEKDAYS)[number];

const SCOPE_OPTIONS: Readonly<Record<PlannerItemScope, SegmentedOption<PlannerItemScope>>> = {
  this: { value: 'this', label: 'This one' },
  following: { value: 'following', label: 'This and later' },
  all: { value: 'all', label: 'All' },
};

const DAY_LONG: Readonly<Record<PlannerRruleWeekday, string>> = {
  MO: 'Monday',
  TU: 'Tuesday',
  WE: 'Wednesday',
  TH: 'Thursday',
  FR: 'Friday',
  SA: 'Saturday',
  SU: 'Sunday',
};

const DAY_NAMES: Readonly<Record<PlannerRruleWeekday, string>> = {
  MO: 'Mon',
  TU: 'Tue',
  WE: 'Wed',
  TH: 'Thu',
  FR: 'Fri',
  SA: 'Sat',
  SU: 'Sun',
};

const WEEK_ORDER: readonly PlannerRruleWeekday[] = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];

const WORK_DAYS = 'MO,TU,WE,TH,FR';

const UNITS: Readonly<Record<PlannerRrule['freq'], readonly [string, string]>> = {
  YEARLY: ['year', 'years'],
  MONTHLY: ['month', 'months'],
  WEEKLY: ['week', 'weeks'],
  DAILY: ['day', 'days'],
  HOURLY: ['hour', 'hours'],
  MINUTELY: ['minute', 'minutes'],
  SECONDLY: ['second', 'seconds'],
};

function everyOf(rule: PlannerRrule): string {
  const [one, many] = UNITS[rule.freq];
  return rule.interval === 1 ? `Every ${one}` : `Every ${String(rule.interval)} ${many}`;
}

function listText(names: readonly string[]): string {
  const last = names.at(-1);
  if (names.length < 2 || last === undefined) return names.join('');
  return `${names.slice(0, -1).join(', ')} and ${last}`;
}

function weekDaysOf(rule: PlannerRrule): string | null {
  if (rule.freq !== 'WEEKLY' || rule.by_day.length === 0) return null;
  if (rule.by_day.some((day) => day.ordinal !== null)) return null;
  const days = WEEK_ORDER.filter((day) => rule.by_day.some(({ weekday }) => weekday === day));
  if (days.join(',') === WORK_DAYS) return 'weekday';
  const [only] = days;
  if (days.length === 1 && only !== undefined) return DAY_LONG[only];
  return listText(days.map((day) => DAY_NAMES[day]));
}

function endOf(rule: PlannerRrule): string {
  if (rule.count !== null) return ` · ${String(rule.count)} times`;
  if (rule.until !== null) {
    return ` · until ${longDate(`${rule.until.value.slice(0, 10)}T12:00:00Z`, 'UTC')}`;
  }
  return '';
}

function headOf(rule: PlannerRrule): string {
  const days = weekDaysOf(rule);
  if (days === null) return everyOf(rule);
  if (rule.interval !== 1) return `${everyOf(rule)} on ${days === 'weekday' ? 'weekdays' : days}`;
  return days === 'weekday' ? 'Weekdays' : `Every ${days}`;
}

export function repeatTextOf(rrule: string | null): string {
  if (rrule === null) return 'Doesn’t repeat';
  const parsed = parsePlannerRrule(rrule);
  if (!parsed.success) return 'Custom repeat';
  return `${headOf(parsed.data)}${endOf(parsed.data)}`;
}

export const NO_REPEAT = 'none';

function weekdayOfDate(date: string): PlannerRruleWeekday {
  return PLANNER_RRULE_WEEKDAYS[new Date(`${date}T12:00:00Z`).getUTCDay()] ?? 'MO';
}

export function repeatOptionsOf(item: PlannerItemRow): readonly SelectOption<string>[] {
  const start = item.start_local;
  if (start === null) return [];
  const presets = [
    'FREQ=DAILY',
    `FREQ=WEEKLY;BYDAY=${WORK_DAYS}`,
    `FREQ=WEEKLY;BYDAY=${weekdayOfDate(start.slice(0, 10))}`,
    'FREQ=MONTHLY',
    'FREQ=YEARLY',
  ];
  const current = item.rrule;
  const rules = current === null || presets.includes(current) ? presets : [current, ...presets];
  return [
    { value: NO_REPEAT, label: repeatTextOf(null) },
    ...rules.map((rule) => ({ value: rule, label: repeatTextOf(rule) })),
  ];
}

export function repeatChangeOf(value: string): ItemChanges {
  return value === NO_REPEAT ? { rrule: null, exdates: [] } : { rrule: value };
}

export interface ScopeInput {
  readonly occurrenceKey: string | null;
  readonly changes: ItemChanges;
}

export function scopeChoicesOf({
  occurrenceKey,
  changes,
}: ScopeInput): readonly PlannerItemScope[] {
  if (occurrenceKey === null) return ['all'];
  if ('rrule' in changes) return ['following', 'all'];
  return ['this', 'following', 'all'];
}

export function scopeIn(
  chosen: PlannerItemScope,
  choices: readonly PlannerItemScope[],
): PlannerItemScope {
  return choices.includes(chosen) ? chosen : (choices[0] ?? 'all');
}

export function patchOf(
  scope: PlannerItemScope,
  occurrenceKey: string | null,
  changes: ItemChanges,
): ItemChange {
  if (scope === 'all' || occurrenceKey === null) return { scope: 'all', changes };
  return { scope, occurrence_key: occurrenceKey, changes };
}

export function hasChanges(changes: ItemChanges): boolean {
  return Object.keys(changes).length > 0;
}

export function scopeBarShown(item: PlannerItemRow, changes: ItemChanges): boolean {
  return item.rrule !== null && hasChanges(changes);
}

export interface RepeatScopeBarProps {
  readonly kind: PlannerItemRow['kind'];
  readonly choices: readonly PlannerItemScope[];
  readonly scope: PlannerItemScope;
  readonly onScope: (scope: PlannerItemScope) => void;
  readonly onSave: () => void;
  readonly onCancel: () => void;
  readonly busy: boolean;
  readonly disabled: boolean;
}

function leadOf(kind: PlannerItemRow['kind'], choices: readonly PlannerItemScope[]): string {
  const noun = kind === 'event' ? 'event' : 'task';
  return choices.length === 1
    ? `This ${noun} repeats. The change applies to every repeat`
    : `This ${noun} repeats. Save the change for`;
}

function SaveButton(props: RepeatScopeBarProps & { readonly grow: boolean }): ReactNode {
  return (
    <Button
      label="Save"
      icon="check"
      variant="filled"
      grow={props.grow}
      loading={props.busy}
      disabled={props.disabled || props.busy}
      onPress={props.onSave}
    />
  );
}

export function RepeatScopeBar(props: RepeatScopeBarProps): ReactNode {
  const pointer = useIdiom() === 'pointer';
  const segmented = (
    <Segmented
      options={props.choices.map((choice) => SCOPE_OPTIONS[choice])}
      value={props.scope}
      onChange={props.onScope}
      label="Which repeats change"
      disabled={props.busy}
      fill={!pointer}
    />
  );
  const lead = (
    <Text
      variant="callout"
      tone="variant"
      {...(pointer ? { className: 'min-w-0 shrink grow basis-48' } : {})}
    >
      {leadOf(props.kind, props.choices)}
    </Text>
  );
  if (pointer) {
    return (
      <View className="flex-row flex-wrap items-center gap-x-4 gap-y-2 border-t border-outline-variant pt-3">
        {lead}
        <View className="ml-auto flex-row flex-wrap items-center justify-end gap-2">
          {segmented}
          <Button label="Cancel" variant="text" onPress={props.onCancel} />
          <SaveButton {...props} grow={false} />
        </View>
      </View>
    );
  }
  return (
    <View className="gap-2 border-t border-outline-variant pt-3">
      {lead}
      {segmented}
      <View className="flex-row gap-2">
        <Button label="Cancel" variant="outlined" grow onPress={props.onCancel} />
        <SaveButton {...props} grow />
      </View>
    </View>
  );
}
