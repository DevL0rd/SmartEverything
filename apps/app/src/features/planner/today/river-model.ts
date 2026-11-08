import type {
  PlannerCollectionRow,
  PlannerColourKey,
  PlannerDay,
  PlannerItemRow,
  PlannerOccurrenceView,
  PlannerPreferences,
} from '@smarteverything/domain';
import { plural } from '../../../format/text';
import { MINUTE_MS, clock, hoursMinutes } from '../../../format/time';

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
  readonly spoken: string;
}

export interface RiverInput {
  readonly day: PlannerDay;
  readonly collections: readonly PlannerCollectionRow[];
  readonly items: readonly PlannerItemRow[];
  readonly hidden: ReadonlySet<string>;
}

function momentOf(value: string | null): number | null {
  return value === null ? null : Date.parse(value);
}

export function riverKeyOf(occurrence: PlannerOccurrenceView): string {
  return `river:${occurrence.item_id}:${occurrence.occurrence_key}`;
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

export function riverOccurrencesOf(day: PlannerDay): readonly PlannerOccurrenceView[] {
  const [, ...rest] = [...day.current, ...day.upcoming];
  const current = new Set(day.current);
  const now = rest.filter((occurrence) => current.has(occurrence));
  const later = rest.filter((occurrence) => !current.has(occurrence)).sort(byRiverOrder);
  return [...now, ...later];
}

function durationOf(minutes: number): string {
  return minutes < 60 ? plural(minutes, 'min', 'min') : hoursMinutes(minutes);
}

export function riverTimeOf(occurrence: PlannerOccurrenceView, timeZone: string): string {
  if (occurrence.all_day) return 'All day';
  const at = occurrence.start ?? occurrence.due_at;
  return at === null ? 'Any time' : clock(at, timeZone);
}

export function riverSubtitleOf(
  occurrence: PlannerOccurrenceView,
  item: PlannerItemRow | undefined,
  timeZone: string,
): string | null {
  const estimate = item?.estimate_minutes ?? null;
  const parts = [
    occurrence.end === null || occurrence.all_day
      ? null
      : `Until ${clock(occurrence.end, timeZone)}`,
    occurrence.start !== null && occurrence.due_at !== null
      ? `Due ${clock(occurrence.due_at, timeZone)}`
      : null,
    occurrence.end === null && estimate !== null ? durationOf(estimate) : null,
    occurrence.location,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(' · ');
}

function spokenOf(row: Omit<RiverRow, 'spoken'>): string {
  return [
    row.time,
    row.title,
    row.subtitle,
    row.calendar,
    row.google ? 'from Google' : null,
    row.sending ? 'sending to Google' : null,
  ]
    .filter((part) => part !== null)
    .join(', ');
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
    key: riverKeyOf(occurrence),
    occurrence,
    at: anchorOf(occurrence),
    now: current.has(occurrence),
    time: riverTimeOf(occurrence, day.time_zone),
    title: occurrence.title,
    subtitle: riverSubtitleOf(occurrence, item, day.time_zone),
    calendar: collection?.name ?? null,
    colour: collection?.colour ?? null,
    google: occurrence.google_state !== null,
    sending: occurrence.google_state === 'sending',
  };
  return { ...row, spoken: spokenOf(row) };
}

export function riverRowsOf(input: RiverInput): readonly RiverRow[] {
  const current: ReadonlySet<PlannerOccurrenceView> = new Set(input.day.current);
  return riverOccurrencesOf(input.day)
    .filter((occurrence) => !input.hidden.has(riverKeyOf(occurrence)))
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
}): string {
  if (input.savedAt !== null) return `as saved ${clock(input.savedAt, input.timeZone)}`;
  const left = `${String(input.left)} left`;
  return input.bookedMinutes > 0 ? `${left} · ${hoursMinutes(input.bookedMinutes)} booked` : left;
}
