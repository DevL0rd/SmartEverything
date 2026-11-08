import { Logger } from '@smarteverything/logging';
import type { PlannerPreferences } from '@smarteverything/domain';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { notify } from '../../../components/toast-store';
import { errorFields } from '../../../design/log-tally';
import { plannerKeys } from '../../../queries/keys';
import { usePlannerPreferences, usePlannerTools } from '../data';

export type Prefs = PlannerPreferences;

export type PrefsChange = { readonly [G in keyof Prefs]?: Partial<Prefs[G]> };

const log = new Logger('app.planner');

const KEY = plannerKeys.preferences(null);

export function mergedPrefs(prefs: Prefs, change: PrefsChange): Prefs {
  return {
    general: { ...prefs.general, ...change.general },
    day_planner: { ...prefs.day_planner, ...change.day_planner },
    tasks: { ...prefs.tasks, ...change.tasks },
    calendar: { ...prefs.calendar, ...change.calendar },
    clock: { ...prefs.clock, ...change.clock },
    watch: { ...prefs.watch, ...change.watch },
    ai: { ...prefs.ai, ...change.ai },
  };
}

export function useOwnPrefs(): Prefs | undefined {
  return usePlannerPreferences(null).data;
}

export function useSavePrefs(title: string): (edit: (prefs: Prefs) => PrefsChange) => void {
  const client = useQueryClient();
  const tools = usePlannerTools(null);
  const mutation = useMutation({
    networkMode: 'always',
    mutationFn: (next: Prefs) => tools.writePreferences(next),
    onMutate: async (next: Prefs): Promise<Prefs | undefined> => {
      await client.cancelQueries({ queryKey: KEY });
      const before = client.getQueryData<Prefs>(KEY);
      client.setQueryData(KEY, next);
      return before;
    },
    onSuccess: (saved): void => {
      client.setQueryData(KEY, saved);
    },
    onError: (error, _next, before): void => {
      if (before !== undefined) {
        client.setQueryData(KEY, before);
      }
      log.warn('preferences_write.failed', { title, ...errorFields(error) });
      notify({ message: `${title} was not changed`, error, tone: 'critical' });
    },
  });
  return (edit) => {
    const current = client.getQueryData<Prefs>(KEY);
    if (current !== undefined) {
      mutation.mutate(mergedPrefs(current, edit(current)));
    }
  };
}
