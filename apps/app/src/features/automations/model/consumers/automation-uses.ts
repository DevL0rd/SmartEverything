import { programReferences, type ReferenceContext } from '@smarteverything/domain';
import type { ConsumerRow } from './row';

export interface AutomationUse {
  readonly id: string;
  readonly name: string;
  readonly enabled: boolean;
}

export function automationsUsing(
  rows: readonly ConsumerRow[],
  referenceId: string,
  ctx: ReferenceContext,
): readonly AutomationUse[] {
  return rows.flatMap((row) =>
    programReferences(row.definition, referenceId, ctx)
      ? [{ id: row.id, name: row.name, enabled: row.enabled }]
      : [],
  );
}
