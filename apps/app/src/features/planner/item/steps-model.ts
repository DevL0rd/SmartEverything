import type { PlannerItemRow } from '@smarteverything/domain';

export interface StepMove {
  readonly itemId: string;
  readonly position: number;
}

interface Placed {
  readonly id: string;
  readonly position: number;
}

function sameOrder(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((key, index) => key === right[index]);
}

export function movedKeyOf(before: readonly string[], after: readonly string[]): string | null {
  if (sameOrder(before, after)) return null;
  return (
    after.find((key) =>
      sameOrder(
        before.filter((other) => other !== key),
        after.filter((other) => other !== key),
      ),
    ) ?? null
  );
}

function positionBetween(previous: Placed | undefined, next: Placed | undefined): number {
  if (previous === undefined && next === undefined) return 0;
  if (previous === undefined) return (next?.position ?? 0) - 1;
  if (next === undefined) return previous.position + 1;
  return (previous.position + next.position) / 2;
}

export function stepMoveOf(steps: readonly Placed[], order: readonly string[]): StepMove | null {
  const key = movedKeyOf(
    steps.map((step) => step.id),
    order,
  );
  if (key === null) return null;
  const byId = new Map(steps.map((step) => [step.id, step]));
  const at = order.indexOf(key);
  const previous = at > 0 ? byId.get(order[at - 1] ?? '') : undefined;
  const next = byId.get(order[at + 1] ?? '');
  return { itemId: key, position: positionBetween(previous, next) };
}

export interface NestTarget {
  readonly id: string;
  readonly title: string;
}

export function canBecomeStep(item: PlannerItemRow, hasSteps: boolean): boolean {
  return (
    item.kind === 'task' &&
    item.parent_id === null &&
    item.series_id === null &&
    item.rrule === null &&
    !hasSteps
  );
}

export function canHoldSteps(item: PlannerItemRow): boolean {
  return item.kind === 'task' && item.parent_id === null && item.series_id === null;
}

export function nestTargetOf(
  item: PlannerItemRow,
  above: PlannerItemRow | null,
  hasSteps: boolean,
): NestTarget | null {
  if (above === null || !canBecomeStep(item, hasSteps) || !canHoldSteps(above)) return null;
  if (above.collection_id !== item.collection_id || above.profile_id !== item.profile_id) {
    return null;
  }
  return { id: above.id, title: above.title };
}

export function indentChangeOf(parentId: string): { readonly parent_id: string } {
  return { parent_id: parentId };
}

export const OUTDENT_CHANGE = { parent_id: null } as const;
