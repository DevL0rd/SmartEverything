import { PLANNER_COLLECTION_ROW, type PlannerCollectionRow } from '@smarteverything/domain';
import type { SQLInputValue } from 'node:sqlite';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag, jsonText } from '../sql';
import type { PlannerItemsRepository } from './planner-items';

const STORED_COLLECTION = storedRow(PLANNER_COLLECTION_ROW, {
  flags: ['visible'],
  json: ['default_reminders', 'google'],
});

const COLUMNS = `id, profile_id, kind, name, colour, icon, position, visible, default_reminders,
  source, google, created_at, updated_at`;

export type PlannerCollectionInput = Omit<PlannerCollectionRow, 'id' | 'created_at' | 'updated_at'>;

type PlannerCollectionPatchFields = Omit<
  PlannerCollectionRow,
  'id' | 'profile_id' | 'created_at' | 'updated_at'
>;

export type PlannerCollectionPatch = {
  readonly [K in keyof PlannerCollectionPatchFields]?: PlannerCollectionPatchFields[K] | undefined;
};

function parameters(row: PlannerCollectionRow): Record<string, SQLInputValue> {
  return {
    ...row,
    visible: flag(row.visible),
    default_reminders: jsonText(row.default_reminders),
    google: row.google === null ? null : jsonText(row.google),
  };
}

export class PlannerCollectionsRepository {
  constructor(
    private readonly context: StoreContext,
    private readonly items: PlannerItemsRepository,
  ) {}

  find(id: string, profileId: string): PlannerCollectionRow | undefined {
    return this.context.sql.get(
      STORED_COLLECTION,
      `select ${COLUMNS} from planner_collections where id = $id and profile_id = $profileId`,
      { id, profileId },
    );
  }

  byId(id: string, profileId: string): PlannerCollectionRow {
    return found(this.find(id, profileId), 'planner collection', id);
  }

  list(profileId: string): PlannerCollectionRow[] {
    return this.context.sql.all(
      STORED_COLLECTION,
      `select ${COLUMNS} from planner_collections where profile_id = $profileId
       order by kind, position, id`,
      { profileId },
    );
  }

  byGoogle(profileId: string, googleId: string): PlannerCollectionRow | undefined {
    return this.context.sql.get(
      STORED_COLLECTION,
      `select ${COLUMNS} from planner_collections
       where profile_id = $profileId and json_extract(google, '$.id') = $googleId`,
      { profileId, googleId },
    );
  }

  insert(input: PlannerCollectionInput): PlannerCollectionRow {
    return this.context.write(() => {
      const now = this.context.now();
      const row = PLANNER_COLLECTION_ROW.parse({
        ...input,
        id: this.context.newId(),
        created_at: now,
        updated_at: now,
      });
      const values = parameters(row);
      const columns = Object.keys(values);
      this.context.sql.run(
        'add the planner collection',
        `insert into planner_collections (${columns.join(', ')})
         values (${columns.map((column) => `$${column}`).join(', ')})`,
        values,
      );
      this.context.changed('planner_collections', 'INSERT', row, null);
      return row;
    });
  }

  update(id: string, profileId: string, patch: PlannerCollectionPatch): PlannerCollectionRow {
    return this.context.write(() => {
      const before = this.byId(id, profileId);
      const after = PLANNER_COLLECTION_ROW.parse({
        ...before,
        ...patch,
        updated_at: this.context.now(),
      });
      const set = assignments(parameters(after));
      this.context.sql.run(
        'change the planner collection',
        `update planner_collections set ${set.text} where id = $id`,
        set.parameters,
      );
      this.context.changed('planner_collections', 'UPDATE', after, before);
      return after;
    });
  }

  remove(id: string, profileId: string): void {
    this.context.write(() => {
      const before = this.byId(id, profileId);
      this.items.purgeCollection(id);
      this.context.sql.run(
        'remove the planner collection',
        'delete from planner_collections where id = $id',
        { id },
      );
      this.context.changed('planner_collections', 'DELETE', null, before);
    });
  }
}
