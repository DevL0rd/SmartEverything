import { PLANNER_ALARM_ROW, type PlannerAlarmRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';

const STORED_ALARM = storedRow(PLANNER_ALARM_ROW, {
  flags: ['enabled', 'vibrate'],
  json: ['days', 'targets', 'watch'],
});

const COLUMNS = `id, profile_id, label, time, days, once_on, skip_on, enabled, sound, ramp_seconds,
  vibrate, snooze_minutes, smart_minutes, wake_scene_id, wake_lead_minutes, targets, watch, source,
  created_at, updated_at`;

export type PlannerAlarmInput = Omit<PlannerAlarmRow, 'id' | 'created_at' | 'updated_at'>;

export type PlannerAlarmPatch = Partial<
  Omit<PlannerAlarmRow, 'id' | 'profile_id' | 'created_at' | 'updated_at'>
>;

function parameters(row: PlannerAlarmRow): Record<string, SQLInputValue> {
  return {
    ...row,
    days: jsonText(row.days),
    enabled: flag(row.enabled),
    vibrate: flag(row.vibrate),
    targets: jsonText(row.targets),
    watch: jsonText(row.watch),
  };
}

export class PlannerAlarmsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string, profileId: string): PlannerAlarmRow | undefined {
    return this.context.sql.get(
      STORED_ALARM,
      `select ${COLUMNS} from planner_alarms where id = $id and profile_id = $profileId`,
      { id, profileId },
    );
  }

  byId(id: string, profileId: string): PlannerAlarmRow {
    return found(this.find(id, profileId), 'planner alarm', id);
  }

  list(profileId: string): PlannerAlarmRow[] {
    return this.context.sql.all(
      STORED_ALARM,
      `select ${COLUMNS} from planner_alarms where profile_id = $profileId order by time, id`,
      { profileId },
    );
  }

  enabled(): PlannerAlarmRow[] {
    return this.context.sql.all(
      STORED_ALARM,
      `select ${COLUMNS} from planner_alarms where enabled = 1 order by time, id`,
    );
  }

  insert(input: PlannerAlarmInput): PlannerAlarmRow {
    return this.context.write(() => {
      const now = this.context.now();
      const row = PLANNER_ALARM_ROW.parse({
        ...input,
        id: this.context.newId(),
        created_at: now,
        updated_at: now,
      });
      const values = parameters(row);
      const columns = Object.keys(values);
      this.context.sql.run(
        'add the planner alarm',
        `insert into planner_alarms (${columns.join(', ')})
         values (${columns.map((column) => `$${column}`).join(', ')})`,
        values,
      );
      this.context.changed('planner_alarms', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, profileId: string, patch: PlannerAlarmPatch): PlannerAlarmRow {
    return this.context.write(() => {
      const before = this.byId(id, profileId);
      const after = PLANNER_ALARM_ROW.parse({
        ...before,
        ...patch,
        updated_at: this.context.now(),
      });
      const set = assignments(parameters(after));
      this.context.sql.run(
        'change the planner alarm',
        `update planner_alarms set ${set.text} where id = $id`,
        set.parameters,
      );
      this.context.changed('planner_alarms', 'UPDATE', after, before);
      return after;
    });
  }

  remove(id: string, profileId: string): void {
    this.context.write(() => {
      const before = this.byId(id, profileId);
      this.context.sql.run(
        'remove the planner alarm',
        'delete from planner_alarms where id = $id',
        {
          id,
        },
      );
      this.context.changed('planner_alarms', 'DELETE', null, before);
    });
  }
}
