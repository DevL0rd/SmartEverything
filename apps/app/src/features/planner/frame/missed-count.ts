import type { PlannerSummary } from '@smarteverything/domain';
import { usePlannerSummary } from '../data/summary';

export function missedCountOf(summary: PlannerSummary | null): number {
  return summary?.missed ?? 0;
}

export function usePlannerMissedCount(): number {
  return missedCountOf(usePlannerSummary(null));
}
