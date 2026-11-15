import type { PlannerRingNotice, PlannerRingRow } from '@smarteverything/domain';
import { z } from 'zod';

export type PhoneRingKind = 'alarm' | 'timer';

export type RingRef =
  | { readonly kind: 'id'; readonly ringId: string }
  | { readonly kind: 'key'; readonly ring: PhoneRingKind; readonly refId: string };

const KEY = z
  .string()
  .transform((text) => text.split(':'))
  .pipe(z.tuple([z.enum(['alarm', 'timer']), z.uuid()]));

export function ringRefOf(param: string): RingRef {
  const key = KEY.safeParse(param);
  if (!key.success) return { kind: 'id', ringId: param };
  const [ring, refId] = key.data;
  return { kind: 'key', ring, refId };
}

export function phoneRingKeyOf(kind: PlannerRingRow['kind'], refId: string): string | null {
  return kind === 'reminder' ? null : `${kind}:${refId}`;
}

export function refKeyOf(ref: RingRef): string | null {
  return ref.kind === 'key' ? phoneRingKeyOf(ref.ring, ref.refId) : null;
}

function latestOf(rows: readonly PlannerRingRow[]): PlannerRingRow | null {
  return rows.reduce<PlannerRingRow | null>(
    (best, row) => (best === null || Date.parse(row.due_at) > Date.parse(best.due_at) ? row : best),
    null,
  );
}

export function ringIdOf(
  ref: RingRef,
  incoming: PlannerRingNotice | null,
  dayRings: readonly PlannerRingRow[] | undefined,
): string | null | undefined {
  if (ref.kind === 'id') return ref.ringId;
  if (incoming?.kind === ref.ring && incoming.refId === ref.refId) return incoming.ringId;
  if (dayRings === undefined) return undefined;
  const matching = dayRings.filter((row) => row.kind === ref.ring && row.ref_id === ref.refId);
  return latestOf(matching)?.id ?? null;
}
