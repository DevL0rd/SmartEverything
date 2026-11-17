import type {
  PlannerCollectionRow,
  PlannerColourKey,
  PlannerDay,
  PlannerGuestResponse,
  PlannerGuestRow,
  PlannerItemRow,
  PlannerOccurrenceView,
  PlannerPreferences,
} from '@smarteverything/domain';
import { plural } from '../../../format/text';
import type { MomentText } from '../../../format/clock-text';
import { MINUTE_MS, hoursMinutes } from '../../../format/time';

export type FadeStrength = PlannerPreferences['day_planner']['fade'];

export type RiverStep = 0 | 1 | 2 | 3 | 4;

export const RIVER_STEPS: readonly RiverStep[] = [0, 1, 2, 3, 4];

export const FADE_FROM_MINUTES: Readonly<Record<FadeStrength, readonly number[]>> = {
  off: [],
  soft: [120, 180, 270, 360],
  strong: [60, 90, 135, 180],
};

export interface RiverRow {
  readonly key: string;
  readonly occurrence: PlannerOccurrenceView;
  readonly at: number | null;
  readonly now: boolean;
  readonly time: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly calendar: string | null;
  readonly colour: PlannerColourKey | null;
  readonly google: boolean;
  readonly sending: boolean;
  readonly invite: PlannerGuestResponse | null;
  readonly guests: number;
  readonly spoken: string;
}

export interface RiverInput {
  readonly day: PlannerDay;
  readonly collections: readonly PlannerCollectionRow[];
  readonly items: readonly PlannerItemRow[];
  readonly hidden: ReadonlySet<string>;
  readonly lens: PlannerOccurrenceView | null;
  readonly guests: readonly PlannerGuestRow[];
  readonly me: string | null;
  readonly instant: MomentText;
}

function momentOf(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

export function occurrenceKeyOf(occurrence: PlannerOccurrenceView): string {
  return `${occurrence.item_id}:${occurrence.occurrence_key}`;
}

export function anchorOf(occurrence: PlannerOccurrenceView): number | null {
  if (occurrence.all_day) return null;
  return momentOf(occurrence.start) ?? momentOf(occurrence.due_at);
}

function placeOf(occurrence: PlannerOccurrenceView): number {
  if (occurrence.all_day) return 0;
  return anchorOf(occurrence) === null ? 2 : 1;
}

function byRiverOrder(left: PlannerOccurrenceView, right: PlannerOccurrenceView): number {
  const place = placeOf(left) - placeOf(right);
  if (place !== 0) return place;
  return (anchorOf(left) ?? 0) - (anchorOf(right) ?? 0);
}

export function riverOccurrencesOf(
  day: PlannerDay,
  lens: PlannerOccurrenceView | null,
): readonly PlannerOccurrenceView[] {
  const rest = [...day.current, ...day.upcoming].filter((occurrence) => occurrence !== lens);
  const current = new Set(day.current);
  const now = rest.filter((occurrence) => current.has(occurrence));
  const later = rest.filter((occurrence) => !current.has(occurrence)).sort(byRiverOrder);
  return [...now, ...later];
}

function durationOf(minutes: number): string {
  return minutes < 60 ? plural(minutes, 'min', 'min') : hoursMinutes(minutes);
}

export function riverTimeOf(
  occurrence: PlannerOccurrenceView,
  timeZone: string,
  instant: MomentText,
): string {
  if (occurrence.all_day) return 'All day';
  const at = occurrence.start ?? occurrence.due_at;
  return at === null ? 'Anytime' : instant(at, timeZone);
}

export function riverSubtitleOf(
  occurrence: PlannerOccurrenceView,
  item: PlannerItemRow | undefined,
  timeZone: string,
  instant: MomentText,
): string | null {
  const estimate = item?.estimate_minutes ?? null;
  const parts = [
    occurrence.end === null || occurrence.all_day
      ? null
      : `Until ${instant(occurrence.end, timeZone)}`,
    occurrence.start !== null && occurrence.due_at !== null
      ? `Due ${instant(occurrence.due_at, timeZone)}`
      : null,
    occurrence.end === null && estimate !== null ? durationOf(estimate) : null,
    occurrence.location,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

const INVITE_WORDS: Readonly<Record<PlannerGuestResponse, string>> = {
  needs_action: 'invited, not answered',
  yes: 'you are going',
  maybe: 'you might go',
  no: 'you are not going',
};

function spokenOf(row: Omit<RiverRow, 'spoken'>): string {
  return [
    row.time,
    row.title,
    row.subtitle,
    row.calendar,
    row.invite === null ? null : INVITE_WORDS[row.invite],
    row.guests === 0 ? null : plural(row.guests, 'guest'),
    row.google ? 'from Google' : null,
    row.sending ? 'sending to Google' : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
}

export interface GuestMarks {
  readonly invite: PlannerGuestResponse | null;
  readonly guests: number;
}

export function guestMarksOf(
  itemId: string,
  item: PlannerItemRow | undefined,
  input: Pick<RiverInput, 'guests' | 'me'>,
): GuestMarks {
  const masterId = item?.series_id ?? itemId;
  const rows = input.guests.filter((row) => row.item_id === masterId);
  const mine = rows.find((row) => row.kind === 'person' && row.profile_id === input.me);
  if (mine !== undefined) return { invite: mine.response, guests: 0 };
  return { invite: null, guests: item?.profile_id === input.me ? rows.length : 0 };
}

function rowOf(
  occurrence: PlannerOccurrenceView,
  input: RiverInput,
  current: ReadonlySet<PlannerOccurrenceView>,
): RiverRow {
  const { day, collections, items } = input;
  const collection = collections.find((row) => row.id === occurrence.collection_id);
  const item = items.find((row) => row.id === occurrence.item_id);
  const row = {
    key: occurrenceKeyOf(occurrence),
    occurrence,
    at: anchorOf(occurrence),
    now: current.has(occurrence),
    time: riverTimeOf(occurrence, day.time_zone, input.instant),
    title: occurrence.title,
    subtitle: riverSubtitleOf(occurrence, item, day.time_zone, input.instant),
    calendar: collection?.name ?? null,
    colour: collection?.colour ?? null,
    google: occurrence.google_state !== null,
    sending: occurrence.google_state === 'sending',
    ...guestMarksOf(occurrence.item_id, item, input),
  };
  return { ...row, spoken: spokenOf(row) };
}

export function riverRowsOf(input: RiverInput): readonly RiverRow[] {
  const current: ReadonlySet<PlannerOccurrenceView> = new Set(input.day.current);
  return riverOccurrencesOf(input.day, input.lens)
    .filter((occurrence) => !input.hidden.has(occurrenceKeyOf(occurrence)))
    .map((occurrence) => rowOf(occurrence, input, current));
}

function stepAt(minutes: number, from: readonly number[]): RiverStep {
  const passed = from.filter((threshold) => minutes >= threshold).length;
  return RIVER_STEPS[Math.min(passed, RIVER_STEPS.length - 1)] ?? 0;
}

function later(left: RiverStep, right: RiverStep): RiverStep {
  return left >= right ? left : right;
}

export function fadeStepsOf(
  rows: readonly Pick<RiverRow, 'at' | 'now'>[],
  now: number,
  strength: FadeStrength,
): readonly RiverStep[] {
  const from = FADE_FROM_MINUTES[strength];
  const steps: RiverStep[] = [];
  for (const row of rows) {
    const before = steps.at(-1) ?? 0;
    if (row.now) steps.push(0);
    else if (row.at === null) steps.push(before);
    else steps.push(later(before, stepAt(Math.max(0, row.at - now) / MINUTE_MS, from)));
  }
  return steps;
}

export function sameSteps(left: readonly RiverStep[], right: readonly RiverStep[]): boolean {
  return left.length === right.length && left.every((step, index) => step === right[index]);
}

export function riverCaptionOf(input: {
  readonly left: number;
  readonly bookedMinutes: number;
  readonly savedAt: number | null;
  readonly timeZone: string;
  readonly instant: MomentText;
}): string {
  if (input.savedAt !== null) return `as saved ${input.instant(input.savedAt, input.timeZone)}`;
  const left = `${String(input.left)} left`;
  return input.bookedMinutes > 0 ? `${left} · ${hoursMinutes(input.bookedMinutes)} booked` : left;
}
