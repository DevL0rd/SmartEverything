import { PLANNER_OCCURRENCE_ROW, type PlannerOccurrenceRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { found, moment, type StoreContext } from '../context';
import { inList, jsonText } from '../sql';

const STORED_OCCURRENCE = storedRow(PLANNER_OCCURRENCE_ROW, { json: ['evidence'] });

const COLUMNS =
  'item_id, occurrence_key, status, completed_at, completed_by, evidence, moved_start, moved_end';

export interface PlannerCompletionWindow {
  readonly from: string;
  readonly to: string;
}

function parameters(row: PlannerOccurrenceRow): Record<string, SQLInputValue> {
  return { ...row, evidence: row.evidence === null ? null : jsonText(row.evidence) };
}

export class PlannerOccurrencesRepository {
  constructor(private readonly context: StoreContext) {}

  find(itemId: string, occurrenceKey: string): PlannerOccurrenceRow | undefined {
    return this.context.sql.get(
      STORED_OCCURRENCE,
      `select ${COLUMNS} from planner_occurrences
       where item_id = $itemId and occurrence_key = $occurrenceKey`,
      { itemId, occurrenceKey },
    );
  }

  byKey(itemId: string, occurrenceKey: string): PlannerOccurrenceRow {
    return found(
      this.find(itemId, occurrenceKey),
      'planner occurrence',
      `${itemId}/${occurrenceKey}`,
    );
  }

  forItems(itemIds: readonly string[]): PlannerOccurrenceRow[] {
    const items = inList('item_id', 'ids', itemIds);
    return this.context.sql.all(
      STORED_OCCURRENCE,
      `select ${COLUMNS} from planner_occurrences where ${items.text} order by item_id, occurrence_key`,
      items.parameters,
    );
  }

  completedBetween(profileId: string, window: PlannerCompletionWindow): PlannerOccurrenceRow[] {
    return this.context.sql.all(
      STORED_OCCURRENCE,
      `select ${COLUMNS.split(', ')
        .map((column) => `o.${column}`)
        .join(', ')}
       from planner_occurrences o join planner_items i on i.id = o.item_id
       where i.profile_id = $profileId and i.deleted_at is null
         and o.completed_at >= $from and o.completed_at < $to
       order by o.completed_at, o.item_id, o.occurrence_key`,
      { profileId, from: moment(window.from), to: moment(window.to) },
    );
  }

  save(row: PlannerOccurrenceRow): PlannerOccurrenceRow {
    return this.context.write(() => {
      const after = PLANNER_OCCURRENCE_ROW.parse(row);
      const before = this.find(after.item_id, after.occurrence_key);
      const values = parameters(after);
      const columns = Object.keys(values);
      this.context.sql.run(
        'save the planner occurrence',
        `insert or replace into planner_occurrences (${columns.join(', ')})
         values (${columns.map((column) => `$${column}`).join(', ')})`,
        values,
      );
      this.context.changed(
        'planner_occurrences',
        before === undefined ? 'INSERT' : 'UPDATE',
        after,
        before ?? null,
      );
      return after;
    });
  }

  remove(itemId: string, occurrenceKey: string): void {
    this.context.write(() => {
      const before = this.byKey(itemId, occurrenceKey);
      this.context.sql.run(
        'remove the planner occurrence',
        'delete from planner_occurrences where item_id = $itemId and occurrence_key = $occurrenceKey',
        { itemId, occurrenceKey },
      );
      this.context.changed('planner_occurrences', 'DELETE', null, before);
    });
  }

  removeForItems(itemIds: readonly string[]): void {
    this.context.write(() => {
      const removed = this.forItems(itemIds);
      const items = inList('item_id', 'ids', itemIds);
      this.context.sql.run(
        'remove the planner occurrences',
        `delete from planner_occurrences where ${items.text}`,
        items.parameters,
      );
      for (const before of removed) {
        this.context.changed('planner_occurrences', 'DELETE', null, before);
      }
    });
  }
}
