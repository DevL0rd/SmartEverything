import { fieldNames, present, valuesEqual, type FieldMap } from './fields';

export type Side = 'mine' | 'theirs';

export interface FieldConflict {
  readonly field: string;
  readonly winner: Side;
  readonly kept: unknown;
  readonly lost: unknown;
}

export interface MergeInput {
  readonly base: FieldMap;
  readonly mine: FieldMap;
  readonly theirs: FieldMap;
  readonly mineUpdatedAt: number;
  readonly theirsUpdatedAt: number;
}

export interface MergeResult {
  readonly merged: FieldMap;
  readonly conflicts: readonly FieldConflict[];
  readonly pushFields: readonly string[];
}

function newerSide(input: MergeInput): Side {
  return input.mineUpdatedAt > input.theirsUpdatedAt ? 'mine' : 'theirs';
}

export function mergeFields(input: MergeInput): MergeResult {
  const merged: Record<string, unknown> = {};
  const conflicts: FieldConflict[] = [];
  const pushFields: string[] = [];
  const winnerOnConflict = newerSide(input);
  for (const field of fieldNames(input.base, input.mine, input.theirs)) {
    const base = present(input.base, field);
    const mine = present(input.mine, field);
    const theirs = present(input.theirs, field);
    let value: unknown;
    if (valuesEqual(mine, theirs) || valuesEqual(base, mine)) {
      value = theirs;
    } else if (valuesEqual(base, theirs)) {
      value = mine;
    } else {
      value = winnerOnConflict === 'mine' ? mine : theirs;
      conflicts.push({
        field,
        winner: winnerOnConflict,
        kept: value,
        lost: winnerOnConflict === 'mine' ? theirs : mine,
      });
    }
    if (value !== undefined) merged[field] = value;
    if (!valuesEqual(value, theirs)) pushFields.push(field);
  }
  return { merged, conflicts, pushFields };
}

export type DeleteResolution = 'delete' | 'already_deleted' | 'resurrect';

export function resolveLocalDelete(input: {
  readonly baseEtag: string;
  readonly remoteEtag: string;
  readonly remoteDeleted: boolean;
}): DeleteResolution {
  if (input.remoteDeleted) return 'already_deleted';
  return input.remoteEtag === input.baseEtag ? 'delete' : 'resurrect';
}
