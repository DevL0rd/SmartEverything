import {
  PLANNER_COLLECTION_SHARE_ROW,
  type PlannerCollectionShareRow,
  type PlannerShareRole,
} from '@smarteverything/domain';
import { storedRow } from '../codec';
import { assignments, found, type StoreContext } from '../context';
import { flag } from '../sql';

const STORED_SHARE = storedRow(PLANNER_COLLECTION_SHARE_ROW, { flags: ['visible'] });

const COLUMNS = 'collection_id, profile_id, role, colour, visible, created_at';

export interface PlannerShareInput {
  readonly collection_id: string;
  readonly profile_id: string;
  readonly role: PlannerShareRole;
}

export interface PlannerShareViewerPatch {
  readonly colour?: PlannerCollectionShareRow['colour'] | undefined;
  readonly visible?: boolean | undefined;
}

function parameters(row: PlannerCollectionShareRow): Record<string, string | number | null> {
  return { ...row, visible: flag(row.visible) };
}

export function removeSharesOfCollection(context: StoreContext, collectionId: string): void {
  context.write(() => {
    const removed = context.sql.all(
      STORED_SHARE,
      `select ${COLUMNS} from planner_collection_shares where collection_id = $collectionId`,
      { collectionId },
    );
    context.sql.run(
      'remove the planner shares of the collection',
      'delete from planner_collection_shares where collection_id = $collectionId',
      { collectionId },
    );
    for (const before of removed)
      context.changed('planner_collection_shares', 'DELETE', null, before);
  });
}

export class PlannerSharesRepository {
  constructor(private readonly context: StoreContext) {}

  find(collectionId: string, profileId: string): PlannerCollectionShareRow | undefined {
    return this.context.sql.get(
      STORED_SHARE,
      `select ${COLUMNS} from planner_collection_shares
       where collection_id = $collectionId and profile_id = $profileId`,
      { collectionId, profileId },
    );
  }

  byKey(collectionId: string, profileId: string): PlannerCollectionShareRow {
    return found(
      this.find(collectionId, profileId),
      'planner share',
      `${collectionId}/${profileId}`,
    );
  }

  forCollection(collectionId: string): PlannerCollectionShareRow[] {
    return this.context.sql.all(
      STORED_SHARE,
      `select ${COLUMNS} from planner_collection_shares
       where collection_id = $collectionId order by created_at, profile_id`,
      { collectionId },
    );
  }

  forProfile(profileId: string): PlannerCollectionShareRow[] {
    return this.context.sql.all(
      STORED_SHARE,
      `select ${COLUMNS} from planner_collection_shares
       where profile_id = $profileId order by created_at, collection_id`,
      { profileId },
    );
  }

  all(): PlannerCollectionShareRow[] {
    return this.context.sql.all(
      STORED_SHARE,
      `select ${COLUMNS} from planner_collection_shares order by collection_id, profile_id`,
    );
  }

  save(input: PlannerShareInput): PlannerCollectionShareRow {
    return this.context.write(() => {
      const before = this.find(input.collection_id, input.profile_id);
      if (before === undefined) return this.insert(input);
      if (before.role === input.role) return before;
      const after = PLANNER_COLLECTION_SHARE_ROW.parse({ ...before, role: input.role });
      this.context.sql.run(
        'change the planner share role',
        `update planner_collection_shares set role = $role
         where collection_id = $collection_id and profile_id = $profile_id`,
        { role: after.role, collection_id: after.collection_id, profile_id: after.profile_id },
      );
      this.context.changed('planner_collection_shares', 'UPDATE', after, before);
      return after;
    });
  }

  change(
    collectionId: string,
    profileId: string,
    patch: PlannerShareViewerPatch,
  ): PlannerCollectionShareRow {
    return this.context.write(() => {
      const before = this.byKey(collectionId, profileId);
      const after = PLANNER_COLLECTION_SHARE_ROW.parse({
        ...before,
        ...(patch.colour === undefined ? {} : { colour: patch.colour }),
        ...(patch.visible === undefined ? {} : { visible: patch.visible }),
      });
      const set = assignments({ colour: after.colour, visible: flag(after.visible) });
      this.context.sql.run(
        'change the planner share of the viewer',
        `update planner_collection_shares set ${set.text}
         where collection_id = $collection_id and profile_id = $profile_id`,
        { ...set.parameters, collection_id: collectionId, profile_id: profileId },
      );
      this.context.changed('planner_collection_shares', 'UPDATE', after, before);
      return after;
    });
  }

  remove(collectionId: string, profileId: string): void {
    this.context.write(() => {
      const before = this.byKey(collectionId, profileId);
      this.context.sql.run(
        'remove the planner share',
        `delete from planner_collection_shares
         where collection_id = $collectionId and profile_id = $profileId`,
        { collectionId, profileId },
      );
      this.context.changed('planner_collection_shares', 'DELETE', null, before);
    });
  }

  private insert(input: PlannerShareInput): PlannerCollectionShareRow {
    const row = PLANNER_COLLECTION_SHARE_ROW.parse({
      ...input,
      colour: null,
      visible: true,
      created_at: this.context.now(),
    });
    const values = parameters(row);
    const columns = Object.keys(values);
    this.context.sql.run(
      'share the planner collection',
      `insert into planner_collection_shares (${columns.join(', ')})
       values (${columns.map((column) => `$${column}`).join(', ')})`,
      values,
    );
    this.context.changed('planner_collection_shares', 'INSERT', row, null);
    return row;
  }
}
