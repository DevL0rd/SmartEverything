import { PLANNER_RING_ROW, type PlannerRingRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, moment, type StoreContext } from '../context';
import { jsonText } from '../sql';

const STORED_RING = storedRow(PLANNER_RING_ROW, { json: ['target'] });

const COLUMNS =
  'id, kind, ref_id, profile_id, due_at, rang_at, dismissed_at, snoozes, target, outcome, missed_reason';

export type PlannerRingInput = Omit<PlannerRingRow, 'id'>;

export type PlannerRingPatch = Partial<
  Omit<PlannerRingRow, 'id' | 'profile_id' | 'kind' | 'ref_id'>
>;

export interface PlannerRingWindow {
  readonly from: string;
  readonly to: string;
}

function parameters(row: PlannerRingRow): Record<string, SQLInputValue> {
  return { ...row, target: row.target === null ? null : jsonText(row.target) };
}

export class PlannerRingsRepository {
  constructor(private readonly context: StoreContext) {}

  find(id: string): PlannerRingRow | undefined {
    return this.context.sql.get(
      STORED_RING,
      `select ${COLUMNS} from planner_rings where id = $id`,
      { id },
    );
  }

  byId(id: string): PlannerRingRow {
    return found(this.find(id), 'planner ring', id);
  }

  between(profileId: string, window: PlannerRingWindow): PlannerRingRow[] {
    return this.context.sql.all(
      STORED_RING,
      `select ${COLUMNS} from planner_rings
       where profile_id = $profileId and due_at >= $from and due_at < $to order by due_at, id`,
      { profileId, from: moment(window.from), to: moment(window.to) },
    );
  }

  forRef(kind: PlannerRingRow['kind'], refId: string): PlannerRingRow[] {
    return this.context.sql.all(
      STORED_RING,
      `select ${COLUMNS} from planner_rings where kind = $kind and ref_id = $refId
       order by due_at, id`,
      { kind, refId },
    );
  }

  ringing(profileId: string): PlannerRingRow[] {
    return this.context.sql.all(
      STORED_RING,
      `select ${COLUMNS} from planner_rings
       where profile_id = $profileId and outcome = 'rang' and dismissed_at is null
       order by due_at, id`,
      { profileId },
    );
  }

  missed(profileId: string, window: PlannerRingWindow): PlannerRingRow[] {
    return this.context.sql.all(
      STORED_RING,
      `select ${COLUMNS} from planner_rings
       where profile_id = $profileId and outcome = 'missed' and due_at >= $from and due_at < $to
       order by due_at, id`,
      { profileId, from: moment(window.from), to: moment(window.to) },
    );
  }

  insert(input: PlannerRingInput): PlannerRingRow {
    return this.context.write(() => {
      const row = PLANNER_RING_ROW.parse({ ...input, id: this.context.newId() });
      const values = parameters(row);
      const columns = Object.keys(values);
      this.context.sql.run(
        'add the planner ring',
        `insert into planner_rings (${columns.join(', ')})
         values (${columns.map((column) => `$${column}`).join(', ')})`,
        values,
      );
      return row;
    });
  }

  update(id: string, patch: PlannerRingPatch): PlannerRingRow {
    return this.context.write(() => {
      const after = PLANNER_RING_ROW.parse({ ...this.byId(id), ...patch });
      const set = assignments(parameters(after));
      this.context.sql.run(
        'change the planner ring',
        `update planner_rings set ${set.text} where id = $id`,
        set.parameters,
      );
      return after;
    });
  }
}
