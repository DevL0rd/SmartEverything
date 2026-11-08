import type { PlannerItemRow } from '@smarteverything/domain';
import {
  resolveLocalDelete,
  type DeleteResolution,
  type FieldMap,
  type GoogleTask,
} from '@smarteverything/google';
import type { PlannerItemsRepository } from '../../store/repositories/planner-items';
import type { Scope, TasksLocal } from './tasks-local';
import {
  PATCH_FIELDS,
  baseFields,
  baseOf,
  basePosition,
  googleOrder,
  insertBody,
  requestBody,
  taskFields,
} from './tasks-map';
import { GoogleApiError, type TaskPlacement, type TasksWire } from './tasks-wire';

interface Synced {
  readonly etag: string;
  readonly base: FieldMap;
  readonly position: number;
}

function isUncertain(cause: unknown): boolean {
  return !(cause instanceof GoogleApiError) || cause.failure.kind === 'unavailable';
}

function isPreconditionFailure(cause: unknown): boolean {
  return cause instanceof GoogleApiError && cause.failure.kind === 'precondition_failed';
}

export class TasksPush {
  constructor(
    private readonly items: PlannerItemsRepository,
    private readonly wire: TasksWire,
    private readonly local: TasksLocal,
    private readonly now: () => string,
  ) {}

  async push(scope: Scope): Promise<void> {
    const { items } = this;
    const rows = this.local.tasks(scope).filter((row) => row.status !== 'proposed');
    for (const row of this.parentsFirst(rows)) {
      const current = items.byId(row.id, scope.profileId);
      if (current.google === null) await this.insert(scope, current);
      else if (current.google.state === 'synced') await this.pushChanges(scope, current, false);
    }
    const trashed = items
      .trashed(scope.profileId)
      .filter(
        (row) => row.collection_id === scope.collection.id && typeof row.google?.id === 'string',
      );
    for (const row of trashed) await this.pushDelete(scope, row);
    this.local.applyParents(scope);
  }

  private parentsFirst(rows: readonly PlannerItemRow[]): PlannerItemRow[] {
    const byId = new Map(rows.map((row) => [row.id, row]));
    const depth = (row: PlannerItemRow, seen: number): number => {
      const parent = row.parent_id === null ? undefined : byId.get(row.parent_id);
      return parent === undefined || seen > rows.length ? 0 : 1 + depth(parent, seen + 1);
    };
    return [...rows].sort((a, b) => depth(a, 0) - depth(b, 0) || a.position - b.position);
  }

  private placement(scope: Scope, item: PlannerItemRow): TaskPlacement {
    const previous = this.local
      .tasks(scope)
      .filter((row) => row.parent_id === item.parent_id && row.position < item.position)
      .sort((a, b) => b.position - a.position)
      .map((row) => row.google?.id)
      .find((id) => typeof id === 'string');
    const parent = this.local.googleParent(scope, item);
    return {
      ...(parent === undefined ? {} : { parent }),
      ...(previous === undefined ? {} : { previous }),
    };
  }

  private async insert(scope: Scope, item: PlannerItemRow): Promise<void> {
    if (item.parent_id !== null && this.local.googleParent(scope, item) === undefined) return;
    const fields = this.local.fieldsOf(scope, item);
    this.items.update(item.id, scope.profileId, {
      google: {
        id: null,
        calendarOrListId: scope.listId,
        etag: null,
        base: baseOf({ fields, position: item.position, sentAt: this.now() }),
        state: 'sending',
      },
    });
    let task: GoogleTask;
    try {
      task = await this.wire.insert(scope, this.placement(scope, item), insertBody(fields));
    } catch (cause) {
      if (!isUncertain(cause)) this.items.update(item.id, scope.profileId, { google: null });
      throw cause;
    }
    const synced = {
      etag: task.etag,
      base: taskFields(task),
      position: googleOrder(task.position),
    };
    this.store(scope, item.id, task.id, synced);
    scope.run.count('pushed');
  }

  private store(scope: Scope, itemId: string, googleId: string, synced: Synced): void {
    this.items.update(itemId, scope.profileId, {
      position: synced.position,
      google: {
        id: googleId,
        calendarOrListId: scope.listId,
        etag: synced.etag,
        base: baseOf({ fields: synced.base, position: synced.position, sentAt: null }),
        state: 'synced',
      },
    });
  }

  private async pushChanges(scope: Scope, item: PlannerItemRow, retried: boolean): Promise<void> {
    const google = item.google;
    const id = google?.id;
    const etag = google?.etag;
    if (google === null || typeof id !== 'string' || typeof etag !== 'string') {
      throw new Error('A synced task has no Google id or etag.');
    }
    const mine = this.local.fieldsOf(scope, item);
    const base = baseFields(google.base);
    const patch = requestBody(mine, base, PATCH_FIELDS, etag);
    let synced: Synced = {
      etag: etag,
      base,
      position: basePosition(google.base) ?? item.position,
    };
    try {
      if (patch !== null) {
        const task = await this.wire.patch(scope, id, patch);
        synced = {
          ...synced,
          etag: task.etag,
          base: { ...taskFields(task), parent: base['parent'] },
        };
        scope.run.count('pushed');
      }
      synced = await this.moveIfNeeded(scope, item, mine, synced);
    } catch (cause) {
      if (!isPreconditionFailure(cause)) throw cause;
      await this.conflict(scope, item, retried);
      return;
    }
    this.store(scope, item.id, id, synced);
  }

  private async moveIfNeeded(
    scope: Scope,
    item: PlannerItemRow,
    mine: FieldMap,
    synced: Synced,
  ): Promise<Synced> {
    const id = item.google?.id;
    if (id === null || id === undefined) return synced;
    if (mine['parent'] === synced.base['parent'] && item.position === synced.position)
      return synced;
    const task = await this.wire.move(scope, id, this.placement(scope, item), synced.etag);
    scope.run.count('pushed');
    return { etag: task.etag, base: taskFields(task), position: googleOrder(task.position) };
  }

  private async conflict(scope: Scope, item: PlannerItemRow, retried: boolean): Promise<void> {
    const id = item.google?.id;
    if (retried || id === null || id === undefined) {
      throw new GoogleApiError({ kind: 'precondition_failed' });
    }
    this.local.mergeIn(scope, item, await this.wire.task(scope, id));
    this.local.applyParents(scope);
    await this.pushChanges(scope, this.items.byId(item.id, scope.profileId), true);
  }

  private async remoteOf(scope: Scope, id: string): Promise<GoogleTask | null> {
    try {
      return await this.wire.task(scope, id);
    } catch (cause) {
      if (cause instanceof GoogleApiError && cause.failure.kind === 'not_found') return null;
      throw cause;
    }
  }

  private async pushDelete(scope: Scope, item: PlannerItemRow): Promise<void> {
    const id = item.google?.id;
    if (typeof id !== 'string') return;
    const remote = await this.remoteOf(scope, id);
    const resolution = remote === null ? 'already_deleted' : this.resolution(item, remote);
    if (remote !== null) await this.settle(scope, resolution, remote);
    this.items.purge(item.id, scope.profileId);
    if (resolution !== 'resurrect') scope.run.count('deleted');
  }

  private resolution(item: PlannerItemRow, remote: GoogleTask): DeleteResolution {
    return resolveLocalDelete({
      baseEtag: item.google?.etag ?? '',
      remoteEtag: remote.etag,
      remoteDeleted: remote.deleted === true,
    });
  }

  private async settle(
    scope: Scope,
    resolution: DeleteResolution,
    remote: GoogleTask,
  ): Promise<void> {
    if (resolution === 'delete') {
      await this.wire.remove(scope, remote.id, remote.etag);
      scope.run.count('pushed');
    }
    if (resolution === 'resurrect') {
      const revived = this.local.importTask(scope, remote);
      scope.run.conflict(revived.id, 'deleted', 'google', true);
    }
  }
}
