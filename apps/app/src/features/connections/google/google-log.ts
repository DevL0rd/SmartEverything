import type {
  GoogleSyncCounts,
  GoogleSyncLogEntry,
  GoogleSyncTrigger,
} from '@smarteverything/domain';
import type { StatusTone } from '../../../components/tone';
import { plural } from '../../../format/text';
import { weekdayShort } from '../../../format/time';

export const WEEK_DAYS = 7;

const DAY_MS = 86_400_000;

export interface LogLine {
  readonly text: string;
  readonly tone: StatusTone;
  readonly caption: string;
}

export interface DayChanges {
  readonly key: string;
  readonly label: string;
  readonly value: number;
}

export interface WeekSummary {
  readonly days: readonly DayChanges[];
  readonly changes: number;
  readonly conflicts: number;
  readonly today: string;
}

const TRIGGERS: Readonly<Record<GoogleSyncTrigger, string>> = {
  link: 'After linking',
  manual: 'Sync now',
  visible: 'Page opened',
  push: 'Google sent a change',
  change: 'Your change',
  ring: 'Before an alarm',
  reconcile: 'Full check',
};

const PRODUCTS = { calendar: 'Calendar', tasks: 'Tasks' } as const;

export function changesOf(counts: GoogleSyncCounts): number {
  return counts.pulled + counts.pushed;
}

export function openChoice(entry: GoogleSyncLogEntry): boolean {
  return entry.choice !== null && entry.choice.resolved_google_id === null;
}

function countsText(counts: GoogleSyncCounts): string {
  if (changesOf(counts) === 0) return 'Nothing changed';
  const pulled = counts.pulled === 0 ? null : `Pulled ${plural(counts.pulled, 'change')}`;
  const pushed = counts.pushed === 0 ? null : `pushed ${String(counts.pushed)}`;
  const text = [pulled, pushed].filter((part) => part !== null).join(', ');
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function keptText(entry: GoogleSyncLogEntry): string {
  const winners = new Set(entry.conflicts.map((conflict) => conflict.winner));
  if (winners.size > 1) return 'kept the newer version of each';
  return winners.has('google') ? 'kept the Google version' : 'kept your version';
}

function conflictText(entry: GoogleSyncLogEntry): string {
  const items = plural(entry.conflicts.length, 'item');
  return `${items} changed on both sides, ${keptText(entry)}. ${countsText(entry.counts)}.`;
}

export function logLine(entry: GoogleSyncLogEntry): LogLine {
  const product = entry.product === null ? null : PRODUCTS[entry.product];
  const caption =
    product === null ? TRIGGERS[entry.trigger] : `${product} · ${TRIGGERS[entry.trigger]}`;
  if (entry.error !== null) {
    return { text: `Sync failed: ${entry.error}`, tone: 'critical', caption };
  }
  if (openChoice(entry)) {
    return {
      text: 'More than one Google task matches one of yours. Choose the one to keep.',
      tone: 'warning',
      caption,
    };
  }
  if (entry.conflicts.length > 0) {
    return { text: conflictText(entry), tone: 'info', caption };
  }
  return { text: countsText(entry.counts), tone: 'positive', caption };
}

function dayKey(moment: number): string {
  const day = new Date(moment);
  return `${String(day.getFullYear())}-${String(day.getMonth() + 1)}-${String(day.getDate())}`;
}

function startOfDay(moment: number): number {
  const day = new Date(moment);
  day.setHours(0, 0, 0, 0);
  return day.getTime();
}

export function weekSummary(entries: readonly GoogleSyncLogEntry[], now: number): WeekSummary {
  const today = startOfDay(now);
  const starts = Array.from({ length: WEEK_DAYS }, (_, index) =>
    startOfDay(today - (WEEK_DAYS - 1 - index) * DAY_MS + DAY_MS / 2),
  );
  const since = starts[0] ?? today;
  const recent = entries.filter((entry) => Date.parse(entry.at) >= since);
  const days = starts.map((start) => {
    const key = dayKey(start);
    const value = recent
      .filter((entry) => dayKey(Date.parse(entry.at)) === key)
      .reduce((sum, entry) => sum + changesOf(entry.counts), 0);
    return { key, label: weekdayShort(start), value };
  });
  return {
    days,
    changes: days.reduce((sum, day) => sum + day.value, 0),
    conflicts: recent.reduce((sum, entry) => sum + entry.conflicts.length, 0),
    today: dayKey(today),
  };
}
