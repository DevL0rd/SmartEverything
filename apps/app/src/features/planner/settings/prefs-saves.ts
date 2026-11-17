import type { PlannerPreferences } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import type { QueryClient } from '@tanstack/react-query';
import { notify } from '../../../components/toast-store';
import { errorFields } from '../../../design/log-tally';
import { plannerKeys } from '../../../queries/keys';
import { createSaveQueue } from '../data/save-queue';

const log = new Logger('app.planner');

export const OWN_PREFS_KEY = plannerKeys.preferences(null);

export interface PrefsSave {
  readonly prefs: PlannerPreferences;
  readonly title: string;
}

export type PrefsWrite = (prefs: PlannerPreferences) => Promise<PlannerPreferences>;

export function prefsSaves(client: QueryClient, write: PrefsWrite): (save: PrefsSave) => void {
  let latest: PlannerPreferences | null = null;
  const queue = createSaveQueue<PrefsSave>({
    event: 'planner_preferences.save',
    send: async ({ prefs }) => {
      await client.cancelQueries({ queryKey: OWN_PREFS_KEY });
      const saved = await write(prefs);
      if (latest === prefs) client.setQueryData(OWN_PREFS_KEY, saved);
    },
    failed: (error, { prefs, title }) => {
      log.warn('preferences_write.failed', { title, ...errorFields(error) });
      notify({ message: `${title} was not changed`, error, tone: 'critical' });
      if (latest !== prefs) return;
      background(
        client.invalidateQueries({ queryKey: OWN_PREFS_KEY }),
        'planner_preferences.reload_failed',
      );
    },
  });
  return (save) => {
    latest = save.prefs;
    client.setQueryData(OWN_PREFS_KEY, save.prefs);
    queue.push(save);
  };
}
