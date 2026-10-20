import { PROGRAM_V3 } from '@smarteverything/domain';
import type { Program } from '../program/walk';
import { applyAdd } from './add';
import { applyHeader } from './header';
import { applyMove } from './move';
import { applyRemove } from './remove';
import { applyRename } from './rename';
import { applyRow } from './rows';
import type { Created, Detachment, OpEnv, Outcome, RefusalCode } from './result';
import { PatchRefusal } from './result';
import type { PatchOp } from './schema';
import { applySet, applyUnset } from './set';
import { applyUnwrap, applyWrap } from './wrap';

export interface PatchOptions {
  readonly newId?: () => string;
}

export type PatchResult =
  | {
      readonly ok: true;
      readonly program: Program;
      readonly inverse: readonly PatchOp[];
      readonly detached: readonly Detachment[];
      readonly created: readonly Created[];
    }
  | {
      readonly ok: false;
      readonly code: RefusalCode;
      readonly reason: string;
      readonly opIndex: number | undefined;
    };

const ISSUES_SHOWN = 5;

function randomId(): string {
  return globalThis.crypto.randomUUID();
}

function applyPlain(
  program: Program,
  op: Exclude<PatchOp, { op: 'add' | 'wrap' | 'row' }>,
): Outcome {
  switch (op.op) {
    case 'set':
      return applySet(program, op);
    case 'unset':
      return applyUnset(program, op);
    case 'move':
      return applyMove(program, op);
    case 'remove':
      return applyRemove(program, op);
    case 'unwrap':
      return applyUnwrap(program, op);
    case 'rename':
      return applyRename(program, op);
    case 'header':
      return applyHeader(program, op);
  }
}

function applyOp(program: Program, op: PatchOp, env: OpEnv): Outcome {
  if (op.op === 'add') return applyAdd(program, op, env);
  if (op.op === 'wrap') return applyWrap(program, op, env);
  if (op.op === 'row') return applyRow(program, op, env);
  return applyPlain(program, op);
}

function attempt(program: Program, op: PatchOp, env: OpEnv): Outcome | PatchRefusal {
  try {
    return applyOp(program, op, env);
  } catch (error) {
    if (error instanceof PatchRefusal) return error;
    throw error;
  }
}

function invalidReason(program: Program): string | undefined {
  const parsed = PROGRAM_V3.safeParse(program);
  if (parsed.success) return undefined;
  return parsed.error.issues
    .slice(0, ISSUES_SHOWN)
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('; ');
}

export function applyPatch(
  program: Program,
  ops: readonly PatchOp[],
  options: PatchOptions = {},
): PatchResult {
  const env: OpEnv = { newId: options.newId ?? randomId };
  let current = program;
  const undo: (readonly PatchOp[])[] = [];
  const detached: Detachment[] = [];
  const created: Created[] = [];
  for (const [opIndex, op] of ops.entries()) {
    const result = attempt(current, op, env);
    if (result instanceof PatchRefusal) {
      return { ok: false, code: result.code, reason: result.reason, opIndex };
    }
    current = result.program;
    undo.unshift(result.inverse);
    detached.push(...result.detached);
    created.push(...result.created);
  }
  const reason = invalidReason(current);
  if (reason !== undefined) {
    return { ok: false, code: 'invalid_result', reason, opIndex: undefined };
  }
  return { ok: true, program: current, inverse: undo.flat(), detached, created };
}
