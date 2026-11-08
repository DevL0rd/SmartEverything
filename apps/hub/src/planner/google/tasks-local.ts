import {
  GOOGLE_CONFLICT,
  type GoogleConflict,
  type GoogleSyncCounts,
  type PlannerCollectionRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import { mergeFields, type FieldMap, type GoogleTask } from '@smarteverything/google';
import type {
  PlannerItemPatch,
  PlannerItemsRepository,
} from '../../store/repositories/planner-items';
import {
  baseFields,
  baseOf,
  basePosition,
  googleOrder,
  importedTask,
  itemFields,
  localDuePatch,
  localNotes,
  taskFields,
  untitled,
} from './tasks-map';
import type { TaskTarget } from './tasks-wire';

export class Run {
  readonly counts: { -readonly [K in keyof GoogleSyncCounts]: number } = {
    pulled: 0,
    created: 0,
    updated: 0,
    deleted: 0,
    pushed: 0,
    conflicts: 0,
  };
  readonly conflicts: GoogleConflict[] = [];
  readonly parents = new Map<string, string | undefined>();

  constructor(readonly profileId: string) {}

  finish(): void {
    this.counts.conflicts = this.conflicts.length;
  }

  count(key: keyof GoogleSyncCounts, by = 1): void {
    this.counts[key] += by;
  }

  conflict(itemId: string, field: string, winner: 'app' | 'google', lost: unknown): void {
    this.conflicts.push(
      GOOGLE_CONFLICT.parse({
        item_id: itemId,
        field,
        winner,
        losing_value: lost ?? null,
      }),
    );
  }
}

export interface Scope extends TaskTarget {
  readonly run: Run;
  readonly collection: PlannerCollectionRow;
}

export class TasksLocal {
  constructor(private readonly items: PlannerItemsRepository) {}

  googleParent(scope: Scope, item: PlannerItemRow): string | undefined {
    if (item.parent_id === null) return undefined;
    return this.items.find(item.parent_id, scope.profileId)?.google?.id ?? undefined;
  }

  fieldsOf(scope: Scope, item: PlannerItemRow): FieldMap {
    return itemFields(item, this.googleParent(scope, item));
  }

  tasks(scope: Scope): PlannerItemRow[] {
    return this.items.list(scope.profileId, {
      collectionIds: [scope.collection.id],
      kind: 'task',
    });
  }

  known(scope: Scope): Map<string, string> {
    const { items } = this;
    const trashed = items
      .trashed(scope.profileId)
      .filter((row) => row.collection_id === scope.collection.id);
    const etags = new Map<string, string>();
    for (const row of [...this.tasks(scope), ...trashed]) {
      const id = row.google?.id;
      const etag = row.google?.etag;
      if (typeof id === 'string' && typeof etag === 'string') etags.set(id, etag);
    }
    return etags;
  }

  adopt(scope: Scope, item: PlannerItemRow, task: GoogleTask): void {
    const sent = item.google?.base ?? {};
    this.items.update(item.id, scope.profileId, {
      google: {
        id: task.id,
        calendarOrListId: scope.listId,
        etag: task.etag,
        base: baseOf({
          fields: baseFields(sent),
          position: basePosition(sent) ?? item.position,
          sentAt: null,
        }),
        state: 'synced',
      },
    });
  }

  importTask(scope: Scope, task: GoogleTask): PlannerItemRow {
    const row = this.items.insert(
      importedTask(task, scope.profileId, scope.collection.id, scope.listId),
    );
    scope.run.parents.set(row.id, task.parent);
    return row;
  }

  mergeIn(scope: Scope, item: PlannerItemRow, task: GoogleTask): void {
    const theirs = taskFields(task);
    const result = mergeFields({
      base: baseFields(item.google?.base ?? {}),
      mine: this.fieldsOf(scope, item),
      theirs,
      mineUpdatedAt: Date.parse(item.updated_at),
      theirsUpdatedAt: Date.parse(task.updated),
    });
    for (const c of result.conflicts) {
      scope.run.conflict(item.id, c.field, c.winner === 'mine' ? 'app' : 'google', c.lost);
    }
    const moved = basePosition(item.google?.base ?? {}) !== item.position;
    this.items.update(item.id, scope.profileId, {
      ...this.mergedPatch(item, result.merged),
      position: moved ? item.position : googleOrder(task.position),
      google: {
        id: task.id,
        calendarOrListId: scope.listId,
        etag: task.etag,
        base: baseOf({ fields: theirs, position: googleOrder(task.position), sentAt: null }),
        state: 'synced',
      },
    });
    const parent = result.merged['parent'];
    scope.run.parents.set(item.id, typeof parent === 'string' ? parent : undefined);
    scope.run.count('updated');
  }

  mergedPatch(item: PlannerItemRow, merged: FieldMap): PlannerItemPatch {
    const { title, notes, status, due } = merged;
    const done = status === 'completed';
    return {
      title: typeof title === 'string' ? untitled(title) : item.title,
      notes: localNotes(typeof notes === 'string' ? notes : undefined, item),
      status: done ? 'done' : item.status === 'done' ? 'open' : item.status,
      ...localDuePatch(item, typeof due === 'string' ? due : undefined),
    };
  }

  removeLocal(scope: Scope, taskId: string): void {
    const { items } = this;
    for (const row of items.byGoogle(scope.profileId, scope.listId, taskId)) {
      if (row.deleted_at === null) {
        items.update(row.id, scope.profileId, { google: null });
        items.trash(row.id, scope.profileId);
      } else {
        items.purge(row.id, scope.profileId);
      }
      scope.run.count('deleted');
    }
  }

  applyParents(scope: Scope): void {
    const { items } = this;
    for (const [id, googleParent] of scope.run.parents) {
      const item = items.find(id, scope.profileId);
      if (item === undefined) continue;
      const parent =
        googleParent === undefined
          ? null
          : (items.byGoogle(scope.profileId, scope.listId, googleParent)[0]?.id ?? null);
      if (parent !== item.parent_id) items.update(id, scope.profileId, { parent_id: parent });
    }
    scope.run.parents.clear();
  }
}
