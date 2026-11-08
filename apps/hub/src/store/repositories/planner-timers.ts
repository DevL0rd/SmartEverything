import { PLANNER_TIMER_ROW, type PlannerTimerRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_TIMER = storedRow(PLANNER_TIMER_ROW, { json: ['targets'] });

const COLUMNS =
  'id, profile_id, label, duration_ms, state, ends_at, remaining_ms, targets, created_at, updated_at';

export type PlannerTimerInput = Omit<PlannerTimerRow, 'id' | 'created_at' | 'updated_at'>;

export type PlannerTimerPatch = Partial<
  Omit<PlannerTimerRow, 'id' | 'profile_id' | 'created_at' | 'updated_at'>
>;

function parameters(row: PlannerTimerRow): Record<string, SQLInputValue> {
  return { ...row, targets: jsonText(row.targets) };
}

export class PlannerTimersRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string, profileId: string): PlannerTimerRow | undefined {
    return this.context.sql.get(
      STORED_TIMER,
      `select ${COLUMNS} from planner_timers where id = $id and profile_id = $profileId`,
      { id, profileId },
    );
  }

  byId(id: string, profileId: string): PlannerTimerRow {
    return found(this.find(id, profileId), 'planner timer', id);
  }

  list(profileId: string): PlannerTimerRow[] {
    return this.context.sql.all(
      STORED_TIMER,
      `select ${COLUMNS} from planner_timers where profile_id = $profileId
       order by created_at, id`,
      { profileId },
    );
  }

  running(): PlannerTimerRow[] {
    return this.context.sql.all(
      STORED_TIMER,
      `select ${COLUMNS} from planner_timers where state = 'running' order by ends_at, id`,
    );
  }

  insert(input: PlannerTimerInput): PlannerTimerRow {
    return this.context.write(() => {
      const now = this.context.now();
      const row = PLANNER_TIMER_ROW.parse({
        ...input,
        id: this.context.newId(),
        created_at: now,
        updated_at: now,
      });
      const values = parameters(row);
      const columns = Object.keys(values);
      this.context.sql.run(
        'add the planner timer',
        `insert into planner_timers (${columns.join(', ')})
         values (${columns.map((column) => `$${column}`).join(', ')})`,
        values,
      );
      this.context.changed('planner_timers', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, profileId: string, patch: PlannerTimerPatch): PlannerTimerRow {
    return this.context.write(() => {
      const before = this.byId(id, profileId);
      const after = PLANNER_TIMER_ROW.parse({
        ...before,
        ...patch,
        updated_at: this.context.now(),
      });
      const set = assignments(parameters(after));
      this.context.sql.run(
        'change the planner timer',
        `update planner_timers set ${set.text} where id = $id`,
        set.parameters,
      );
      this.context.changed('planner_timers', 'UPDATE', after, before);
      return after;
    });
  }

  remove(id: string, profileId: string): void {
    this.context.write(() => {
      const before = this.byId(id, profileId);
      this.context.sql.run(
        'remove the planner timer',
        'delete from planner_timers where id = $id',
        {
          id,
        },
      );
      this.context.changed('planner_timers', 'DELETE', null, before);
    });
  }
}
