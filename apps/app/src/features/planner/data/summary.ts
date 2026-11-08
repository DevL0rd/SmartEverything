import type { PlannerSummary, PlannerSummaryNotice } from '@smarteverything/domain';
import { ValueStore, usePausable } from '../../../design/external-store';
import { useStoreSelector } from '../../../store/store-context';
import { profileIn, type PlannerPerson } from './person';

type Summaries = Readonly<Record<string, PlannerSummary>>;

export const plannerSummaries = new ValueStore<Summaries>({});

export function receivePlannerSummary(notice: PlannerSummaryNotice): void {
  const summary: PlannerSummary = {
    personId: notice.personId,
    missed: notice.missed,
    left: notice.left,
    nextAlarmAt: notice.nextAlarmAt,
    runningTimers: notice.runningTimers,
  };
  plannerSummaries.update((known) => ({ ...known, [notice.personId]: summary }));
}

export function summaryOf(summaries: Summaries, profile: string | null): PlannerSummary | null {
  return profile === null ? null : (summaries[profile] ?? null);
}

export function usePlannerSummary(person: PlannerPerson): PlannerSummary | null {
  const profile = useStoreSelector((state) => profileIn(state, person), Object.is, [person]);
  return usePausable(plannerSummaries.subscribe, () => summaryOf(plannerSummaries.get(), profile));
}
