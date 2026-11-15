import { ApiError, type PlannerItemRow } from '@smarteverything/domain';
import type { PlannerItemPatch } from '../store/repositories/planner-items';
import { resolveItem, type PlannerAccessStore } from './sharing/visibility';

export interface StepSubject {
  readonly id: string | null;
  readonly kind: PlannerItemRow['kind'];
  readonly collection_id: string;
}

function refused(message: string): ApiError {
  return new ApiError('invalid_request', message);
}

export function requireParent(
  store: PlannerAccessStore,
  profileId: string,
  subject: StepSubject,
  parentId: string,
): PlannerItemRow {
  const { item: parent } = resolveItem(store, profileId, parentId, 'steps');
  if (parent.kind !== 'task' || subject.kind !== 'task') throw refused('Only a task has steps.');
  if (parent.parent_id !== null || parent.series_id !== null) {
    throw refused('A step cannot have steps of its own.');
  }
  if (parent.collection_id !== subject.collection_id) {
    throw refused('A step stays in the list of its task.');
  }
  if (subject.id === null) return parent;
  if (parent.id === subject.id) throw refused('A task cannot be a step of itself.');
  if (store.plannerItems.children(subject.id, parent.profile_id).length > 0) {
    throw refused('A task that has steps cannot become a step.');
  }
  return parent;
}

function lastStep(store: PlannerAccessStore, parent: PlannerItemRow): number {
  return store.plannerItems
    .children(parent.id, parent.profile_id)
    .reduce((highest, step) => Math.max(highest, step.position + 1), 0);
}

function afterParent(store: PlannerAccessStore, formerParentId: string): number {
  const former = store.plannerItems.anyById(formerParentId);
  const next = store.plannerItems
    .inCollection(former.collection_id)
    .filter((sibling) => sibling.parent_id === null && sibling.position > former.position)
    .reduce<number | null>(
      (lowest, sibling) =>
        lowest === null ? sibling.position : Math.min(lowest, sibling.position),
      null,
    );
  return next === null ? former.position + 1 : (former.position + next) / 2;
}

export function withStepPosition(
  store: PlannerAccessStore,
  item: PlannerItemRow,
  changes: PlannerItemPatch,
): PlannerItemPatch {
  const { parent_id: parentId, position } = changes;
  if (parentId === undefined || parentId === item.parent_id || position !== undefined) {
    return changes;
  }
  if (parentId === null) {
    return item.parent_id === null
      ? changes
      : { ...changes, position: afterParent(store, item.parent_id) };
  }
  return { ...changes, position: lastStep(store, store.plannerItems.anyById(parentId)) };
}
