import {
  PROGRAM_V4,
  STATIC_KIND_LOOKUP,
  graphRuleIssues,
  type NodeKindLookup,
  type ProgramV4,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { GraphProblem } from '../problem-types';
import { structureProgram } from '../structure';
import { applyAdd } from './add';
import { applyConnect, applyDisconnect } from './connect';
import { applyHeader } from './header';
import { applyPath } from './path';
import { applyRemove } from './remove';
import { applyRename } from './rename';
import type { Created, Detachment, OpEnv, Outcome, RefusalCode } from './result';
import { PatchRefusal } from './result';
import { applyRow } from './row';
import type { PatchOp } from './schema';
import { applySet, applyUnset } from './set';
import { applyWrap } from './wrap';

export interface PatchOptions {
  readonly newId: () => string;
  readonly allowProblems?: boolean;
  readonly kinds: NodeKindLookup;
}

export interface PatchProblem {
  readonly source: 'rules' | 'structure';
  readonly code: string;
  readonly message: string;
  readonly fix?: string;
  readonly key?: string;
  readonly port?: string;
}

export type PatchResult =
  | {
      readonly ok: true;
      readonly program: ProgramV4;
      readonly inverse: readonly PatchOp[];
      readonly detached: readonly Detachment[];
      readonly created: readonly Created[];
      readonly problems: readonly PatchProblem[];
    }
  | {
      readonly ok: false;
      readonly code: RefusalCode;
      readonly reason: string;
      readonly opIndex: number | undefined;
      readonly problems: readonly PatchProblem[];
    };

const ISSUES_SHOWN = 5;

function applyPlain(
  program: ProgramV4,
  op: Exclude<PatchOp, { op: 'add' | 'wrap' | 'row' }>,
  env: OpEnv,
): Outcome {
  switch (op.op) {
    case 'connect':
      return applyConnect(program, op, env);
    case 'disconnect':
      return applyDisconnect(program, op, env);
    case 'set':
      return applySet(program, op, env);
    case 'unset':
      return applyUnset(program, op);
    case 'rename':
      return applyRename(program, op, env);
    case 'remove':
      return applyRemove(program, op, env);
    case 'path':
      return applyPath(program, op, env);
    case 'header':
      return applyHeader(program, op);
  }
}

function applyOp(program: ProgramV4, op: PatchOp, env: OpEnv): Outcome {
  if (op.op === 'add') return applyAdd(program, op, env);
  if (op.op === 'wrap') return applyWrap(program, op, env);
  if (op.op === 'row') return applyRow(program, op, env);
  return applyPlain(program, op, env);
}

function attempt(program: ProgramV4, op: PatchOp, env: OpEnv): Outcome | PatchRefusal {
  try {
    return applyOp(program, op, env);
  } catch (error) {
    if (error instanceof PatchRefusal) return error;
    throw error;
  }
}

function structureProblem(problem: GraphProblem): PatchProblem {
  return {
    source: 'structure',
    code: problem.code,
    message: problem.message,
    fix: problem.fix,
    ...(problem.key === undefined ? {} : { key: problem.key }),
    ...(problem.port === undefined ? {} : { port: problem.port }),
  };
}

function issueCode(issue: z.core.$ZodIssue): string {
  const rule: unknown = issue.code === 'custom' ? issue.params?.['graphRule'] : undefined;
  return typeof rule === 'string' ? rule : 'invalid_program';
}

function ruleProblem(
  program: ProgramV4,
  path: readonly PropertyKey[],
  code: string,
  message: string,
): PatchProblem {
  const [head, index] = path;
  const node = head === 'nodes' && typeof index === 'number' ? program.nodes[index] : undefined;
  const port = path[2] === 'to' ? path[3] : undefined;
  return {
    source: 'rules',
    code,
    message: `${path.join('.')}: ${message}`,
    ...(node === undefined ? {} : { key: node.key }),
    ...(typeof port === 'string' ? { port } : {}),
  };
}

function ruleProblems(program: ProgramV4, kinds: NodeKindLookup): readonly PatchProblem[] {
  const parsed = PROGRAM_V4.safeParse(program);
  const declared = parsed.success
    ? []
    : parsed.error.issues.map((issue) =>
        ruleProblem(program, issue.path, issueCode(issue), issue.message),
      );
  if (kinds === STATIC_KIND_LOOKUP) return declared;
  const seen = new Set(declared.map((found) => `${found.code}|${found.message}`));
  const live = graphRuleIssues(program, kinds)
    .map((found) => ruleProblem(program, found.path, found.code, found.message))
    .filter((found) => !seen.has(`${found.code}|${found.message}`));
  return [...declared, ...live];
}

function structureProblems(program: ProgramV4, kinds: NodeKindLookup): readonly PatchProblem[] {
  const result = structureProgram(program, kinds);
  return result.ok ? [] : result.problems.map(structureProblem);
}

export function problemsOf(
  program: ProgramV4,
  kinds: NodeKindLookup,
): {
  readonly rules: readonly PatchProblem[];
  readonly structure: readonly PatchProblem[];
} {
  const rules = ruleProblems(program, kinds);
  return { rules, structure: rules.length > 0 ? [] : structureProblems(program, kinds) };
}

function reasonOf(problems: readonly PatchProblem[]): string {
  return problems
    .slice(0, ISSUES_SHOWN)
    .map((problem) => problem.message)
    .join('; ');
}

export function applyPatch(
  program: ProgramV4,
  ops: readonly PatchOp[],
  options: PatchOptions,
): PatchResult {
  const kinds = options.kinds;
  const env: OpEnv = { newId: options.newId, kinds };
  let current = program;
  const undo: (readonly PatchOp[])[] = [];
  const detached: Detachment[] = [];
  const created: Created[] = [];
  for (const [opIndex, op] of ops.entries()) {
    const result = attempt(current, op, env);
    if (result instanceof PatchRefusal) {
      return { ok: false, code: result.code, reason: result.reason, opIndex, problems: [] };
    }
    current = result.program;
    undo.unshift(result.inverse);
    detached.push(...result.detached);
    created.push(...result.created);
  }
  const found = problemsOf(current, kinds);
  const blocking =
    options.allowProblems === true ? found.rules : [...found.rules, ...found.structure];
  if (blocking.length > 0) {
    const problems = [...found.rules, ...found.structure];
    return {
      ok: false,
      code: 'invalid_result',
      reason: reasonOf(problems),
      opIndex: undefined,
      problems,
    };
  }
  return {
    ok: true,
    program: current,
    inverse: undo.flat(),
    detached,
    created,
    problems: found.structure,
  };
}
