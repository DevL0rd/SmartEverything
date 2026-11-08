import { PLANNER_STOPWATCH_ROW, type PlannerStopwatchRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';

const STORED_STOPWATCH = storedRow(PLANNER_STOPWATCH_ROW, {
  flags: ['running'],
  json: ['laps'],
});

const COLUMNS = 'id, profile_id, running, started_at, accumulated_ms, laps, updated_at';

export type PlannerStopwatchInput = Omit<PlannerStopwatchRow, 'id' | 'updated_at'>;

export type PlannerStopwatchPatch = Partial<
  Omit<PlannerStopwatchRow, 'id' | 'profile_id' | 'updated_at'>
>;

function parameters(row: PlannerStopwatchRow): Record<string, SQLInputValue> {
  return { ...row, running: flag(row.running), laps: jsonText(row.laps) };
}

export class PlannerStopwatchRepository {
  constructor(private readonly context: StoreContext) {}

  find(profileId: string): PlannerStopwatchRow | undefined {
    return this.context.sql.get(
      STORED_STOPWATCH,
      `select ${COLUMNS} from planner_stopwatches where profile_id = $profileId
       order by updated_at desc, id limit 1`,
      { profileId },
    );
  }

  forProfile(profileId: string): PlannerStopwatchRow {
    return found(this.find(profileId), 'planner stopwatch', profileId);
  }

  insert(input: PlannerStopwatchInput): PlannerStopwatchRow {
    return this.context.write(() => {
      const row = PLANNER_STOPWATCH_ROW.parse({
        ...input,
        id: this.context.newId(),
        updated_at: this.context.now(),
      });
      const values = parameters(row);
      const columns = Object.keys(values);
      this.context.sql.run(
        'add the planner stopwatch',
        `insert into planner_stopwatches (${columns.join(', ')})
         values (${columns.map((column) => `$${column}`).join(', ')})`,
        values,
      );
      this.context.changed('planner_stopwatches', 'INSERT', row, null);
      return row;
    });
  }

  update(profileId: string, patch: PlannerStopwatchPatch): PlannerStopwatchRow {
    return this.context.write(() => {
      const before = this.forProfile(profileId);
      const after = PLANNER_STOPWATCH_ROW.parse({
        ...before,
        ...patch,
        updated_at: this.context.now(),
      });
      const set = assignments(parameters(after));
      this.context.sql.run(
        'change the planner stopwatch',
        `update planner_stopwatches set ${set.text} where id = $id`,
        set.parameters,
      );
      this.context.changed('planner_stopwatches', 'UPDATE', after, before);
      return after;
    });
  }

  remove(profileId: string): void {
    this.context.write(() => {
      const before = this.forProfile(profileId);
      this.context.sql.run(
        'remove the planner stopwatch',
        'delete from planner_stopwatches where id = $id',
        { id: before.id },
      );
      this.context.changed('planner_stopwatches', 'DELETE', null, before);
    });
  }
}
