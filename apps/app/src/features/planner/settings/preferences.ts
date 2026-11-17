import { Logger } from '@smarteverything/logging';
import type { PlannerPreferences } from '@smarteverything/domain';
import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { usePlannerPreferences } from '../data';
import { plannerTools } from '../data/clock-writes';
import { OWN_PREFS_KEY, prefsSaves, type PrefsSave } from './prefs-saves';

export type Prefs = PlannerPreferences;

export type PrefsChange = { readonly [G in keyof Prefs]?: Partial<Prefs[G]> };

const log = new Logger('app.planner');

export function mergedPrefs(prefs: Prefs, change: PrefsChange): Prefs {
  return {
    general: { ...prefs.general, ...change.general },
    day_planner: { ...prefs.day_planner, ...change.day_planner },
    tasks: { ...prefs.tasks, ...change.tasks },
    calendar: { ...prefs.calendar, ...change.calendar },
    clock: { ...prefs.clock, ...change.clock },
    bedtime: { ...prefs.bedtime, ...change.bedtime },
    sleep_sounds: { ...prefs.sleep_sounds, ...change.sleep_sounds },
    watch: { ...prefs.watch, ...change.watch },
    ai: { ...prefs.ai, ...change.ai },
  };
}

export function useOwnPrefs(): Prefs | undefined {
  return usePlannerPreferences(null).data;
}

const queues = new WeakMap<QueryClient, (save: PrefsSave) => void>();

function savesOf(client: QueryClient): (save: PrefsSave) => void {
  const known = queues.get(client);
  if (known !== undefined) return known;
  const tools = plannerTools(null);
  const saves = prefsSaves(client, tools.writePreferences);
  queues.set(client, saves);
  return saves;
}

export function useSavePrefs(title: string): (edit: (prefs: Prefs) => PrefsChange) => void {
  const client = useQueryClient();
  return (edit) => {
    const current = client.getQueryData<Prefs>(OWN_PREFS_KEY);
    if (current === undefined) {
      log.warn('preferences_write.unloaded', { title });
      return;
    }
    savesOf(client)({ prefs: mergedPrefs(current, edit(current)), title });
  };
}
