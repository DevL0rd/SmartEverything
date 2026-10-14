import { z } from 'zod';
import type { ClaudeUsage, AiSubscriptionUsage } from '@smarteverything/domain';
export interface SubscriptionWindow {
  readonly key: string;
  readonly label: string;
  readonly percent: number | null;
  readonly reset: string | null;
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
  rateLimits: SNAPSHOT.optional(),
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
    return [
      {
        key: `${id}:${key}`,
        label: [snapshot.limitName, duration(window.windowDurationMins) ?? `${key} window`]
          .filter(Boolean)
          .join(' · '),
        percent: window.usedPercent,
        reset:
          window.resetsAt === undefined || window.resetsAt === null
            ? null
            : new Date(window.resetsAt * 1000).toLocaleString(),
      },
    ];
  });
}
export function codexSubscriptionWindows(value: unknown): readonly SubscriptionWindow[] {
  const response = LIMITS.safeParse(value);
  if (response.success) {
    const buckets = response.data.rateLimitsByLimitId;
    if (buckets !== undefined && buckets !== null && Object.keys(buckets).length > 0)
      return Object.entries(buckets).flatMap(([id, snapshot]) => windows(snapshot, id));
    if (response.data.rateLimits !== undefined) return windows(response.data.rateLimits, 'account');
  }
  const snapshot = SNAPSHOT.safeParse(value);
  return snapshot.success ? windows(snapshot.data, 'account') : [];
}
export function claudeSubscriptionWindows(
  usage: ClaudeUsage | undefined,
): readonly SubscriptionWindow[] {
  return (
    usage?.windows.map((window) => ({
      key: window.key,
      label: window.window === 'unknown' ? window.key : window.window.replaceAll('_', ' '),
      percent: window.used_percent,
      reset: null,
    })) ?? []
  );
}

export function projectedSubscriptionWindows(
  usage: AiSubscriptionUsage | undefined,
): readonly SubscriptionWindow[] {
  return (
    usage?.windows.map((window) => ({
      key: window.id,
      label: window.label,
      percent: window.used_percent,
      reset:
        window.resets_at === null
          ? null
          : new Date(window.resets_at).toLocaleString([], {
              month: 'short',
              day: 'numeric',
              hour: 'numeric',
              minute: '2-digit',
            }),
    })) ?? []
  );
}
