import type { ClaudeUsage } from '@smarteverything/domain';
import { z } from 'zod';
import { EPOCH_MS, isoOf } from './tolerant';

export const PLAN_USAGE_FILE_NAME = 'plan-usage-history.json';

const WINDOW_BY_KEY: Readonly<Record<string, ClaudeUsage['windows'][number]['window']>> = {
  fh: 'five_hour',
  sd: 'seven_day',
};

export const PLAN_USAGE_FILE = z.object({
  samples: z.array(z.object({ t: EPOCH_MS, u: z.record(z.string(), z.number().min(0).max(1000)) })),
});

export type PlanUsageFile = z.output<typeof PLAN_USAGE_FILE>;

export const NO_USAGE: ClaudeUsage = { sampled_at: null, windows: [] };

export function usageOf(file: PlanUsageFile | undefined): ClaudeUsage {
  const latest = file?.samples.reduce<PlanUsageFile['samples'][number] | undefined>(
    (best, sample) => (best === undefined || sample.t > best.t ? sample : best),
    undefined,
  );
  if (latest === undefined) {
    return NO_USAGE;
  }
  return {
    sampled_at: isoOf(latest.t),
    windows: Object.entries(latest.u).map(([key, used]) => ({
      key,
      window: WINDOW_BY_KEY[key] ?? 'unknown',
      used_percent: used,
    })),
  };
}
