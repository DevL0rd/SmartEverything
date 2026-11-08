import { z } from 'zod';
import type { ClaudeUsage, AiSubscriptionUsage } from '@smarteverything/domain';
import { dateFormat } from '../../../format/locale';
import { rounded, withUnit } from '../../../format/number';
export interface SubscriptionWindow {
  readonly id: string;
  readonly label: string;
  readonly percent: number | null;
  readonly resetAt: number | null;
  readonly window_duration_mins: number | null;
}
export interface WeeklyAllowance {
  readonly text: string;
  readonly resetAt: number | null;
}

export function remainingPercent(usedPercent: number): number {
  return Math.max(0, 100 - usedPercent);
}

export function weeklyAllowance(
  window: SubscriptionWindow | undefined,
  now: number,
): WeeklyAllowance | null {
  const used = window?.percent ?? null;
  const resetAt = window?.resetAt ?? null;
  if (used === null || (resetAt !== null && resetAt <= now)) return null;
  const amount = withUnit(rounded(remainingPercent(used), 1), '%');
  return { text: `${amount} left`, resetAt };
}

export function subscriptionResetText(at: number): string {
  return dateFormat({
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(at);
}

const WINDOW = z.object({
  usedPercent: z.number().nonnegative(),
  windowDurationMins: z.number().positive().nullable().optional(),
  resetsAt: z.number().nullable().optional(),
});
const SNAPSHOT = z.object({
  limitId: z.string().nullable().optional(),
  limitName: z.string().nullable().optional(),
  primary: WINDOW.nullable().optional(),
  secondary: WINDOW.nullable().optional(),
});
const LIMITS = z.object({
  rateLimits: SNAPSHOT.nullable().optional(),
  rateLimitsByLimitId: z.record(z.string(), SNAPSHOT).nullable().optional(),
});
function duration(minutes: number | null | undefined): string | null {
  if (minutes === undefined || minutes === null) return null;
  if (minutes % 1440 === 0) return `${String(minutes / 1440)} day window`;
  if (minutes % 60 === 0) return `${String(minutes / 60)} hour window`;
  return `${String(minutes)} minute window`;
}
function windows(snapshot: z.output<typeof SNAPSHOT>, id: string): SubscriptionWindow[] {
  return (['primary', 'secondary'] as const).flatMap((key) => {
    const window = snapshot[key];
    if (window === undefined || window === null) return [];
    const seconds = window.resetsAt ?? null;
    const resetAt = seconds === null ? null : seconds * 1000;
    return [
      {
        id: JSON.stringify([id, key]),
        label: [snapshot.limitName, duration(window.windowDurationMins) ?? `${key} window`]
          .filter(Boolean)
          .join(' · '),
        percent: window.usedPercent,
        resetAt,
        window_duration_mins: window.windowDurationMins ?? null,
      },
    ];
  });
}

function codexBuckets(response: z.output<typeof LIMITS>): readonly SubscriptionWindow[] {
  const buckets = new Map(Object.entries(response.rateLimitsByLimitId ?? {}));
  const main = response.rateLimits;
  if (main !== undefined && main !== null) {
    const id = main.limitId ?? 'account';
    const exists = [...buckets].some(([key, limit]) => key === id || limit.limitId === id);
    if (!exists) buckets.set(id, main);
  }
  return [...buckets].flatMap(([id, snapshot]) => windows(snapshot, id));
}

export function codexSubscriptionWindows(value: unknown): readonly SubscriptionWindow[] {
  const response = LIMITS.safeParse(value);
  if (response.success) {
    const projected = codexBuckets(response.data);
    if (projected.length > 0) return projected;
  }
  const snapshot = SNAPSHOT.safeParse(value);
  return snapshot.success ? windows(snapshot.data, snapshot.data.limitId ?? 'account') : [];
}

export function claudeSubscriptionWindows(
  usage: ClaudeUsage | undefined,
): readonly SubscriptionWindow[] {
  return (
    usage?.windows.map((window) => ({
      id: window.key,
      label: window.window === 'unknown' ? window.key : window.window.replaceAll('_', ' '),
      percent: window.used_percent,
      resetAt: null,
      window_duration_mins: null,
    })) ?? []
  );
}

function projectedWindowLabel(window: AiSubscriptionUsage['windows'][number]): string {
  const period = duration(window.window_duration_mins);
  if (period === null) return window.label;
  return window.label.replace(/\b(?:primary|secondary)$/u, period);
}

export function projectedSubscriptionWindows(
  usage: AiSubscriptionUsage | undefined,
): readonly SubscriptionWindow[] {
  if (usage?.status !== 'reported') return [];
  return usage.windows.map((window) => ({
    id: window.id,
    label: projectedWindowLabel(window),
    percent: window.used_percent,
    resetAt: window.resets_at === null ? null : Date.parse(window.resets_at),
    window_duration_mins: window.window_duration_mins,
  }));
}
