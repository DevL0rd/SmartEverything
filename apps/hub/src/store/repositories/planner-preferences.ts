import {
  PLANNER_PREFERENCES_ROW,
  type PlannerPreferences,
  type PlannerPreferencesRow,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import type { StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_PREFERENCES = storedRow(PLANNER_PREFERENCES_ROW, { json: ['preferences'] });

const COLUMNS = 'profile_id, preferences, updated_at';

export class PlannerPreferencesRepository {
  constructor(private readonly context: StoreContext) {}

  find(profileId: string): PlannerPreferencesRow | undefined {
    return this.context.sql.get(
      STORED_PREFERENCES,
      `select ${COLUMNS} from planner_preferences where profile_id = $profileId`,
      { profileId },
    );
  }

  put(profileId: string, preferences: PlannerPreferences): PlannerPreferencesRow {
    return this.context.write(() => {
      const row = PLANNER_PREFERENCES_ROW.parse({
        profile_id: profileId,
        preferences,
        updated_at: this.context.now(),
      });
      this.context.sql.run(
        'save the planner preferences',
        `insert into planner_preferences (profile_id, preferences, updated_at)
         values ($profileId, $preferences, $updatedAt)
         on conflict (profile_id) do update
           set preferences = excluded.preferences, updated_at = excluded.updated_at`,
        { profileId, preferences: jsonText(row.preferences), updatedAt: row.updated_at },
      );
      return row;
    });
  }
}
