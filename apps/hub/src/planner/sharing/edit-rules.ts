import { ApiError, type PlannerItemRow } from '@smarteverything/domain';
import type { PlannerItemPatch } from '../../store/repositories/planner-items';
import type { ItemRole } from './visibility';

const ASSIGNEE_TASK_FIELDS: ReadonlySet<string> = new Set(['notes']);

const ASSIGNEE_STEP_BLOCKED: ReadonlySet<string> = new Set(['collection_id', 'assignee_id']);

function forbidden(): ApiError {
  return new ApiError('forbidden', 'You may not change that on this item.');
}

export function writes(role: ItemRole): boolean {
  return role === 'owner' || role === 'edit';
}

export function requireChange(
  role: ItemRole,
  item: PlannerItemRow,
  changes: PlannerItemPatch,
): void {
  if (writes(role)) return;
  if (role !== 'assignee') throw forbidden();
  const fields = Object.keys(changes);
  const allowed =
    item.parent_id === null
      ? fields.every((field) => ASSIGNEE_TASK_FIELDS.has(field))
      : fields.every((field) => !ASSIGNEE_STEP_BLOCKED.has(field));
  if (!allowed) throw forbidden();
}

export function requireRemoval(role: ItemRole, item: PlannerItemRow): void {
  if (writes(role)) return;
  if (role !== 'assignee' || item.parent_id === null) throw forbidden();
}
