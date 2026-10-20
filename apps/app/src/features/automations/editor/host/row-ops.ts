import {
  ROW_EDIT,
  type PatchOp,
  type RowEdit as FlowRowEdit,
} from '@smarteverything/flow/ops/schema';
import type { RowEdit } from '../inspector/sections/rows-model';

export const SCOPE_EDIT_REFUSED = 'Adding, renaming or removing a lane can’t be done here yet.';

function flowEdit(edit: RowEdit): FlowRowEdit | string {
  const { t, ...fields } = edit;
  const [row, action] = t.split('.');
  if (row === 'scope') return SCOPE_EDIT_REFUSED;
  const extra =
    edit.t === 'branch.add'
      ? { when: { lit: true } }
      : edit.t === 'catch.classes'
        ? { classes: edit.classes.length === 0 ? null : edit.classes }
        : {};
  const parsed = ROW_EDIT.safeParse({ row, t: action, ...fields, ...extra });
  return parsed.success ? parsed.data : `That row change is not valid: ${parsed.error.message}`;
}

export type RowOpsResult =
  | { readonly ok: true; readonly ops: readonly PatchOp[] }
  | { readonly ok: false; readonly reason: string };

export function rowOpsOf(key: string, edits: readonly RowEdit[]): RowOpsResult {
  const ops: PatchOp[] = [];
  for (const edit of edits) {
    const next = flowEdit(edit);
    if (typeof next === 'string') return { ok: false, reason: next };
    ops.push({ op: 'row', key, edit: next });
  }
  return { ok: true, ops };
}
