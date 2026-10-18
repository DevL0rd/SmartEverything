import type { ProfileRow } from '@smarteverything/domain';
import type { WeighedReading } from '../../../store/people';
import type { WeighIn } from './weigh-ins';

export interface AssignTarget {
  readonly id: string;
  readonly kg: number;
  readonly iso: string;
  readonly owner: string | null;
}

export interface AssignChoice {
  readonly profileId: string | null;
  readonly label: string;
  readonly selected: boolean;
}

export const GUEST_LABEL = 'Guest – don’t keep';

export function targetOfWeighIn(weighIn: WeighIn, owner: string): AssignTarget {
  return { id: weighIn.id, kg: weighIn.kg, iso: weighIn.iso, owner };
}

export function targetOfPending(reading: WeighedReading): AssignTarget {
  return { id: reading.id, kg: reading.weight_kg, iso: reading.measured_at, owner: null };
}

export function choicesOf(
  target: AssignTarget,
  profiles: readonly ProfileRow[],
  activeId: string | null,
): readonly AssignChoice[] {
  const named = profiles.map((profile) => ({
    profileId: profile.id,
    label: profile.id === activeId ? `Me (${profile.name})` : profile.name,
    selected: profile.id === target.owner,
  }));
  return [...named, { profileId: null, label: GUEST_LABEL, selected: false }];
}

export function queueStep(
  queue: readonly AssignTarget[],
  handled: ReadonlySet<string>,
  total: number,
): { readonly current: AssignTarget | null; readonly position: number; readonly total: number } {
  const current = queue.find((target) => !handled.has(target.id)) ?? null;
  return { current, position: Math.min(total, handled.size + 1), total };
}

export function targetsFor(
  kind: 'one' | 'queue',
  latest: WeighIn | null,
  owner: string | null,
  pending: readonly WeighedReading[],
): readonly AssignTarget[] {
  if (kind === 'queue') {
    return pending.map(targetOfPending);
  }
  return latest === null || owner === null ? [] : [targetOfWeighIn(latest, owner)];
}
