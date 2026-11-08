import type { PlannerCollectionRow, PlannerColourKey } from '@smarteverything/domain';
import { keepPreviousData } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { View } from 'react-native';
import type { PlannerParse, PlannerSuggestion } from '../../../api/planner';
import { Icon, type IconName } from '../../../components/icon';
import { Switch } from '../../../components/switch';
import { Text } from '../../../components/text';
import { cn } from '../../../design/cn';
import { zonedDateFormat } from '../../../format/locale';
import { clock, duration, localDayKey, longDate, shiftDay } from '../../../format/time';
import { useScreenQuery } from '../../../queries/use-screen-query';
import { usePlannerTools, type PlannerPerson, type PlannerTools } from '../data';
import type { QuickAddTarget } from '../frame/quick-add-bar';
import { LIST_DOT, timerReadingOf, type TimerReading, type TokenReading } from './composer-tokens';

export type ComposerKind = 'task' | 'event' | 'alarm' | 'timer';

export const COMPOSER_KINDS: Readonly<Record<QuickAddTarget, readonly ComposerKind[]>> = {
  planner: ['task', 'event', 'alarm', 'timer'],
  clock: ['alarm', 'timer'],
};

type Draft = PlannerParse['draft'];

export interface AlarmDraft {
  readonly time: string;
  readonly label: string | null;
  readonly days: readonly number[];
  readonly once_on: string | null;
}

export type ComposerPlan =
  | { readonly kind: 'item'; readonly body: Draft }
  | { readonly kind: 'alarms'; readonly bodies: readonly AlarmDraft[] }
  | { readonly kind: 'timer'; readonly body: TimerReading }
  | { readonly kind: 'missing'; readonly reason: string };

const HHMM = zonedDateFormat({ hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }, 'en-GB');

const WEEKDAY_INDEX: Readonly<Record<string, number>> = {
  SU: 0,
  MO: 1,
  TU: 2,
  WE: 3,
  TH: 4,
  FR: 5,
  SA: 6,
};

const NEEDS_TIME: ComposerPlan = { kind: 'missing', reason: 'Add a time, like 06:30' };

function hhmmOf(moment: string, timeZone: string): string {
  return HHMM(timeZone).format(new Date(moment));
}

function eventTiming(draft: Draft, timeZone: string): Partial<Draft> | null {
  const undue = { due_at: null, due_date: null };
  if (draft.start_local !== null) return undue;
  if (draft.due_at !== null) {
    const day = localDayKey(draft.due_at, timeZone);
    const start = `${day}T${hhmmOf(draft.due_at, timeZone)}:00`;
    return { ...undue, start_local: start, time_zone: timeZone, all_day: false };
  }
  if (draft.due_date === null) return null;
  return { ...undue, start_local: draft.due_date, time_zone: null, all_day: true };
}

export function itemPlanOf(draft: Draft, kind: 'task' | 'event', timeZone: string): ComposerPlan {
  if (kind === 'task') return { kind: 'item', body: { ...draft, kind } };
  const timing = eventTiming(draft, timeZone);
  if (timing === null) return { kind: 'missing', reason: 'Add a day or a time for an event' };
  return { kind: 'item', body: { ...draft, ...timing, kind } };
}

function ruleParts(rrule: string): ReadonlyMap<string, string> {
  return new Map(
    rrule.split(';').map((part) => {
      const [key = '', value = ''] = part.split('=');
      return [key, value] as const;
    }),
  );
}

function listOf(parts: ReadonlyMap<string, string>, key: string): readonly number[] {
  const value = parts.get(key);
  return value === undefined ? [] : value.split(',').map(Number);
}

function gridTimes(parts: ReadonlyMap<string, string>, fallback: string): readonly string[] {
  const hours = listOf(parts, 'BYHOUR');
  if (hours.length === 0) return [fallback];
  const minutes = listOf(parts, 'BYMINUTE');
  const grid = hours.flatMap((hour) =>
    minutes.map((minute) => `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`),
  );
  const positions = listOf(parts, 'BYSETPOS');
  return positions.length === 0 ? grid : positions.flatMap((at) => grid[at - 1] ?? []);
}

function weekdayOfDate(date: string): number {
  return new Date(`${date}T12:00:00Z`).getUTCDay();
}

function repeatDays(parts: ReadonlyMap<string, string>, start: string): readonly number[] | null {
  const freq = parts.get('FREQ');
  if (parts.has('INTERVAL')) return null;
  if (freq === 'DAILY') return [];
  if (freq !== 'WEEKLY') return null;
  const days = (parts.get('BYDAY') ?? '').split(',').flatMap((day) => WEEKDAY_INDEX[day] ?? []);
  return days.length === 0 ? [weekdayOfDate(start.slice(0, 10))] : days;
}

function repeatingAlarms(draft: Draft, rrule: string): ComposerPlan {
  const start = draft.start_local;
  if (start?.includes('T') !== true) return NEEDS_TIME;
  const parts = ruleParts(rrule);
  const days = repeatDays(parts, start);
  if (days === null) {
    return { kind: 'missing', reason: 'An alarm repeats on days of the week; add this as a task' };
  }
  const times = gridTimes(parts, start.slice(11, 16));
  return {
    kind: 'alarms',
    bodies: times.map((time) => ({ time, label: draft.title, days, once_on: null })),
  };
}

export function alarmPlanOf(draft: Draft, timeZone: string): ComposerPlan {
  if (draft.rrule !== null) return repeatingAlarms(draft, draft.rrule);
  const once = (time: string, day: string): ComposerPlan => ({
    kind: 'alarms',
    bodies: [{ time, label: draft.title, days: [], once_on: day }],
  });
  if (draft.start_local?.includes('T') === true) {
    return once(draft.start_local.slice(11, 16), draft.start_local.slice(0, 10));
  }
  if (draft.due_at === null) return NEEDS_TIME;
  return once(hhmmOf(draft.due_at, timeZone), localDayKey(draft.due_at, timeZone));
}

export interface PlanInput {
  readonly kind: ComposerKind;
  readonly text: string;
  readonly parsed: PlannerParse | null;
  readonly timeZone: string;
}

export function composerPlanOf({ kind, text, parsed, timeZone }: PlanInput): ComposerPlan | null {
  if (kind === 'timer') {
    const timer = timerReadingOf(text);
    return timer === null
      ? { kind: 'missing', reason: 'Add how long, like 10 min' }
      : { kind: 'timer', body: timer };
  }
  if (parsed === null) return null;
  if (kind === 'alarm') return alarmPlanOf(parsed.draft, timeZone);
  return itemPlanOf(parsed.draft, kind, timeZone);
}

export interface WillAddChip {
  readonly key: string;
  readonly label: string;
  readonly icon: IconName | null;
  readonly colour: PlannerColourKey | null;
}

function chip(key: string, label: string, icon: IconName | null): WillAddChip {
  return { key, label, icon, colour: null };
}

function repeatChips(repeat: string): readonly WillAddChip[] {
  const split = /^(.*?) (?:at|from) (.+)$/.exec(repeat);
  if (split === null) return [chip('repeat', repeat, 'repeat')];
  const [, head = repeat, times = ''] = split;
  return [chip('repeat', head, 'repeat'), chip('time', times, 'clock')];
}

export interface Today {
  readonly now: number;
  readonly timeZone: string;
}

function dayWord(day: string, today: Today): string {
  const key = localDayKey(today.now, today.timeZone);
  if (day === key) return 'Today';
  if (day === shiftDay(key, 1)) return 'Tomorrow';
  return longDate(`${day}T12:00:00Z`, 'UTC');
}

function whenChip(draft: Draft, today: Today): WillAddChip | null {
  const start = draft.start_local;
  if (start !== null) {
    const day = dayWord(start.slice(0, 10), today);
    const end = draft.end_local?.slice(11, 16);
    const span = start.includes('T')
      ? ` ${start.slice(11, 16)}${end === undefined ? '' : ` to ${end}`}`
      : '';
    return chip('when', `${day}${span}`, 'clock');
  }
  if (draft.due_at !== null) {
    const day = dayWord(localDayKey(draft.due_at, today.timeZone), today);
    return chip('when', `${day} ${clock(draft.due_at, today.timeZone)}`, 'clock');
  }
  return draft.due_date === null ? null : chip('when', dayWord(draft.due_date, today), 'clock');
}

function itemChips(
  body: Draft,
  parsed: PlannerParse,
  context: ChipContext,
): readonly WillAddChip[] {
  const list = context.collections.find((row) => row.id === body.collection_id);
  const when = parsed.repeat_text === null ? whenChip(body, context.today) : null;
  return [
    chip(
      'kind',
      body.kind === 'event' ? 'Event' : 'Task',
      body.kind === 'event' ? 'calendar' : 'circleCheck',
    ),
    ...(parsed.repeat_text === null ? [] : repeatChips(parsed.repeat_text)),
    ...(when === null ? [] : [when]),
    ...(list === undefined
      ? []
      : [{ key: 'list', label: list.name, icon: null, colour: list.colour }]),
    ...(body.priority === null
      ? []
      : [chip('priority', `Priority ${String(body.priority)}`, 'alert')]),
    ...body.tags.map((tag) => chip(`tag:${tag}`, `#${tag}`, 'hash')),
  ];
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function alarmDaysText(alarm: AlarmDraft, today: Today): string {
  if (alarm.once_on !== null) return `Once, ${dayWord(alarm.once_on, today)}`;
  if (alarm.days.length === 0) return 'Every day';
  if ([1, 2, 3, 4, 5].every((day) => alarm.days.includes(day)) && alarm.days.length === 5) {
    return 'Weekdays';
  }
  return alarm.days.map((day) => WEEKDAY_NAMES[day] ?? '').join(', ');
}

function alarmChips(bodies: readonly AlarmDraft[], today: Today): readonly WillAddChip[] {
  const [first] = bodies;
  if (first === undefined) return [];
  return [
    chip('kind', bodies.length === 1 ? 'Alarm' : `${String(bodies.length)} alarms`, 'alarmClock'),
    chip('time', bodies.map((alarm) => alarm.time).join(' and '), 'clock'),
    chip('repeat', alarmDaysText(first, today), 'repeat'),
    ...(first.label === null ? [] : [chip('label', first.label, 'pencil')]),
  ];
}

function timerChips(timer: TimerReading): readonly WillAddChip[] {
  return [
    chip('kind', 'Timer', 'timer'),
    chip('length', duration(timer.ms / 1000), 'clock'),
    ...(timer.label === null ? [] : [chip('label', timer.label, 'pencil')]),
  ];
}

export interface ChipContext {
  readonly collections: readonly PlannerCollectionRow[];
  readonly today: Today;
}

export function willAddOf(
  plan: ComposerPlan,
  parsed: PlannerParse | null,
  context: ChipContext,
): readonly WillAddChip[] {
  if (plan.kind === 'timer') return timerChips(plan.body);
  if (plan.kind === 'alarms') return alarmChips(plan.bodies, context.today);
  if (plan.kind === 'item' && parsed !== null) return itemChips(plan.body, parsed, context);
  return [];
}

export function nextLineOf(
  plan: ComposerPlan,
  parsed: PlannerParse | null,
  today: Today,
): string | null {
  if (plan.kind !== 'item' || parsed === null) return null;
  const [next] = parsed.next_occurrences;
  if (next === undefined) return null;
  return `Next: ${longDate(next, today.timeZone)} ${clock(next, today.timeZone)}`;
}

export function readingOf(
  kind: ComposerKind,
  text: string,
  parsed: PlannerParse | null,
  collections: readonly PlannerCollectionRow[],
): TokenReading | null {
  if (kind === 'timer') {
    const timer = timerReadingOf(text);
    return timer === null ? null : { title: timer.label ?? '', listName: null };
  }
  if (parsed === null) return null;
  const list = collections.find((row) => row.id === parsed.draft.collection_id);
  return { title: parsed.draft.title, listName: list?.name ?? null };
}

export interface ParseState {
  readonly parsed: PlannerParse | null;
  readonly problem: string | null;
  readonly current: boolean;
  readonly suggestions: readonly PlannerSuggestion[];
}

function useParsed(
  tools: PlannerTools,
  key: readonly unknown[],
  text: string | null,
  timeZone: string,
): Pick<ParseState, 'parsed' | 'problem' | 'current'> {
  const parse = useScreenQuery({
    queryKey: [...key, timeZone, text],
    queryFn: () => tools.parse({ text: text ?? '', time_zone: timeZone }),
    enabled: text !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  if (text === null) return { parsed: null, problem: null, current: false };
  if (parse.error !== null) return { parsed: null, problem: parse.error.message, current: false };
  return { parsed: parse.data ?? null, problem: null, current: !parse.isPlaceholderData };
}

function useSuggestions(
  tools: PlannerTools,
  key: readonly unknown[],
  title: string | null,
): readonly PlannerSuggestion[] {
  const suggest = useScreenQuery({
    queryKey: [...key, title],
    queryFn: () => tools.suggestCompletion({ title: title ?? '' }),
    enabled: title !== null,
    placeholderData: keepPreviousData,
    retry: false,
  });
  return title === null ? [] : (suggest.data ?? []);
}

export function useParsePreview(
  person: PlannerPerson,
  text: string,
  kind: ComposerKind,
  timeZone: string,
): ParseState {
  const tools = usePlannerTools(person);
  const trimmed = text.trim();
  const read = kind === 'timer' || trimmed === '' ? null : trimmed;
  const { parsed, problem, current } = useParsed(
    tools,
    ['planner', 'parse', person],
    read,
    timeZone,
  );
  const title = kind === 'task' ? (parsed?.draft.title ?? null) : null;
  const suggestions = useSuggestions(tools, ['planner', 'suggest-completion', person], title);
  return { parsed, problem, current, suggestions };
}

function ChipDot({ colour }: { readonly colour: PlannerColourKey }): ReactNode {
  return <View className={cn('size-2 rounded-full', LIST_DOT[colour])} />;
}

function Chip({ chip: item }: { readonly chip: WillAddChip }): ReactNode {
  return (
    <View className="flex-row items-center gap-1 rounded-full bg-surface-3 px-2 py-0.5">
      {item.colour === null ? null : <ChipDot colour={item.colour} />}
      {item.icon === null ? null : <Icon name={item.icon} size={16} tone="variant" />}
      <Text variant="caption" tone="variant" numberOfLines={1}>
        {item.label}
      </Text>
    </View>
  );
}

export function WillAdd({
  chips,
  labelled,
}: {
  readonly chips: readonly WillAddChip[];
  readonly labelled: boolean;
}): ReactNode {
  if (chips.length === 0) return null;
  return (
    <View
      accessible
      accessibilityLabel={`Will add ${chips.map((item) => item.label).join(', ')}`}
      className="flex-row flex-wrap items-center gap-2"
    >
      {labelled ? (
        <Text variant="caption" tone="variant">
          Will add
        </Text>
      ) : null}
      {chips.map((item) => (
        <Chip key={item.key} chip={item} />
      ))}
    </View>
  );
}

const WINDOW_TEXT: Readonly<Record<'occurrence' | 'day', string>> = {
  occurrence: 'Counts near each time it is due',
  day: 'Counts any time that day',
};

export function RuleCard({
  suggestion,
  on,
  onChange,
}: {
  readonly suggestion: PlannerSuggestion;
  readonly on: boolean;
  readonly onChange: (on: boolean) => void;
}): ReactNode {
  const window = suggestion.completion.kind === 'signal' ? suggestion.completion.window : null;
  const title = `Done when ${suggestion.label}`;
  return (
    <View className="flex-row items-center gap-3 rounded-lg border-hairline border-outline-variant bg-primary/12 py-2 pl-card-pad pr-2">
      <Icon name="zap" size={20} tone="primary" />
      <View className="min-w-0 flex-1 gap-0.5">
        <Text variant="body-strong">{title}</Text>
        {window === null ? null : (
          <Text variant="footnote" tone="variant">
            {WINDOW_TEXT[window]}
          </Text>
        )}
      </View>
      <Switch value={on} onChange={onChange} label={title} />
    </View>
  );
}
