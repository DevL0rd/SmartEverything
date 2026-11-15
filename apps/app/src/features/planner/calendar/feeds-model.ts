import {
  PLANNER_FEED_URL,
  type PlannerExportLink,
  type PlannerFeed,
  type PlannerHolidayRegion,
  type PlannerImportResult,
} from '@smarteverything/domain';
import { hostOf, plural } from '../../../format/text';
import { relative } from '../../../format/time';

const HOUR = 60;

const DAY = 24 * HOUR;

export const REFRESH_CHOICES = [HOUR, 3 * HOUR, 6 * HOUR, 12 * HOUR, DAY, 7 * DAY] as const;

export function refreshText(minutes: number): string {
  if (minutes % (7 * DAY) === 0) return plural(minutes / (7 * DAY), 'week').replace(/^1 /, '');
  if (minutes % DAY === 0) return plural(minutes / DAY, 'day').replace(/^1 /, '');
  if (minutes % HOUR === 0) return plural(minutes / HOUR, 'hour').replace(/^1 /, '');
  return plural(minutes, 'minute').replace(/^1 /, '');
}

export function refreshOptionsOf(
  current: number,
): readonly { readonly value: string; readonly label: string }[] {
  const values = REFRESH_CHOICES.some((choice) => choice === current)
    ? [...REFRESH_CHOICES]
    : [...REFRESH_CHOICES, current].sort((left, right) => left - right);
  return values.map((value) => ({ value: String(value), label: `Every ${refreshText(value)}` }));
}

export type AddressCheck =
  | { readonly ok: true; readonly url: string }
  | { readonly ok: false; readonly reason: string | null };

export function addressOf(text: string): AddressCheck {
  const trimmed = text.trim();
  if (trimmed === '') return { ok: false, reason: null };
  const parsed = PLANNER_FEED_URL.safeParse(trimmed);
  if (parsed.success) return { ok: true, url: parsed.data };
  return {
    ok: false,
    reason: 'Use a calendar address that starts with https://, http:// or webcal://',
  };
}

export function subscriptionNameOf(url: string): string {
  return hostOf(url) ?? 'Subscription';
}

export interface FeedStatus {
  readonly text: string;
  readonly tone: 'variant' | 'critical';
}

export function regionNameOf(
  regions: readonly PlannerHolidayRegion[],
  country: string,
  state: string | null,
): string {
  const region = regions.find((entry) => entry.country === country);
  const countryName = region?.name ?? country;
  if (state === null) return countryName;
  const stateName = region?.states.find((entry) => entry.code === state)?.name ?? state;
  return `${stateName}, ${countryName}`;
}

export function feedStatusOf(
  feed: PlannerFeed,
  now: number,
  regions: readonly PlannerHolidayRegion[],
): FeedStatus {
  if (feed.kind === 'holidays') {
    return { text: regionNameOf(regions, feed.country, feed.state), tone: 'variant' };
  }
  if (feed.kind === 'birthdays') {
    return { text: 'Everyone at home with a birth date', tone: 'variant' };
  }
  const every = `every ${refreshText(feed.refresh_minutes)}`;
  if (feed.failure !== null) {
    return {
      text: `Refresh failed ${relative(feed.failure.at, now)}: ${feed.failure.reason}`,
      tone: 'critical',
    };
  }
  if (feed.fetched_at === null) return { text: `Not fetched yet · ${every}`, tone: 'variant' };
  return { text: `Refreshed ${relative(feed.fetched_at, now)} · ${every}`, tone: 'variant' };
}

export interface ImportReport {
  readonly headline: string;
  readonly counts: readonly {
    readonly key: 'added' | 'updated' | 'unchanged';
    readonly label: string;
    readonly count: number;
  }[];
  readonly skipped: readonly string[];
}

export function importReportOf(result: PlannerImportResult): ImportReport {
  const total = result.added + result.updated + result.unchanged;
  return {
    headline:
      total === 0 ? 'Nothing in this file could be imported' : `${plural(total, 'item')} imported`,
    counts: [
      { key: 'added', label: 'Added', count: result.added },
      { key: 'updated', label: 'Updated', count: result.updated },
      { key: 'unchanged', label: 'Already up to date', count: result.unchanged },
    ],
    skipped: result.unsupported.map(
      (entry) => `${entry.detail}${entry.count > 1 ? ` (${String(entry.count)} times)` : ''}`,
    ),
  };
}

export function reachText(link: PlannerExportLink): string {
  return link.reach === 'public'
    ? 'Anyone with this address can read the calendar.'
    : 'Works at home only, the hub has no public address.';
}

export function exportNameOf(name: string): string {
  const safe = name
    .trim()
    .replace(/[^\p{L}\p{N} _-]+/gu, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `${safe === '' ? 'calendar' : safe}.ics`;
}

export function defaultCountryOf(
  regions: readonly PlannerHolidayRegion[],
  home: string | null,
): string | null {
  const wanted = regions.find((entry) => entry.country === home);
  return wanted?.country ?? regions[0]?.country ?? null;
}
