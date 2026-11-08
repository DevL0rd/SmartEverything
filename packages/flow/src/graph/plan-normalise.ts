import { JSON_VALUE, type JsonValue } from '@smarteverything/domain';
import type { Plan, PlanOp } from '../compile/plan';
import { sha256Hex } from '../functions/sha256';

type ValueOp = Extract<PlanOp, { op: 'compute' | 'read' }>;

export interface NormalisedPlan {
  readonly plan: Plan;
  readonly values: Readonly<Record<string, ValueOp>>;
}

export interface PlanComparison {
  readonly equal: boolean;
  readonly beforeHash: string;
  readonly afterHash: string;
}

function isValueOp(op: PlanOp): op is ValueOp {
  return op.op === 'compute' || (op.op === 'read' && op.capture !== 'at-step');
}

function hasOutputs(outputs: readonly unknown[] | undefined): boolean {
  return outputs !== undefined && outputs.length > 0;
}

function isEmptySeq(op: PlanOp | undefined): boolean {
  return op?.op === 'seq' && op.ops.length === 0;
}

function liftAll(ops: readonly PlanOp[], found: ValueOp[]): PlanOp[] {
  return ops.flatMap((op) => {
    if (isValueOp(op)) {
      found.push(op);
      return [];
    }
    return [lift(op, found)];
  });
}

function liftScopes(
  scopes: Readonly<Record<string, PlanOp>> | undefined,
  found: ValueOp[],
): Record<string, PlanOp> | undefined {
  if (scopes === undefined) return undefined;
  return Object.fromEntries(Object.entries(scopes).map(([name, op]) => [name, lift(op, found)]));
}

function liftBranch(op: Extract<PlanOp, { op: 'branch' }>, found: ValueOp[]): PlanOp {
  const { else: fallback, ...rest } = op;
  const lifted = fallback === undefined ? undefined : lift(fallback, found);
  const absent = isEmptySeq(lifted) && !hasOutputs(op.outputs);
  return {
    ...rest,
    rows: op.rows.map((row) => ({ ...row, then: lift(row.then, found) })),
    ...(lifted === undefined || absent ? {} : { else: lifted }),
  };
}

function liftSwitch(op: Extract<PlanOp, { op: 'switch' }>, found: ValueOp[]): PlanOp {
  const { default: fallback, ...rest } = op;
  const lifted = fallback === undefined ? undefined : lift(fallback, found);
  const absent = isEmptySeq(lifted) && !hasOutputs(op.outputs);
  return {
    ...rest,
    cases: op.cases.map((row) => ({ ...row, then: lift(row.then, found) })),
    ...(lifted === undefined || absent ? {} : { default: lifted }),
  };
}

function liftTry(op: Extract<PlanOp, { op: 'try' }>, found: ValueOp[]): PlanOp {
  const { finally: closing, ...rest } = op;
  return {
    ...rest,
    body: lift(op.body, found),
    catches: op.catches.map((row) => ({ ...row, then: lift(row.then, found) })),
    ...(closing === undefined ? {} : { finally: lift(closing, found) }),
  };
}

function liftWithScopes(
  op: Extract<PlanOp, { op: 'wait' | 'state_op' }>,
  found: ValueOp[],
): PlanOp {
  const { scopes, ...rest } = op;
  const lifted = liftScopes(scopes, found);
  return lifted === undefined ? rest : { ...rest, scopes: lifted };
}

function liftBodies(op: PlanOp, found: ValueOp[]): PlanOp {
  if (op.op === 'loop' || op.op === 'with_effect') return { ...op, body: lift(op.body, found) };
  if (op.op === 'parallel') {
    const branches = op.branches.map((branch) => ({ ...branch, body: lift(branch.body, found) }));
    return { ...op, branches };
  }
  return op;
}

function lift(op: PlanOp, found: ValueOp[]): PlanOp {
  if (op.op === 'seq') return { ...op, ops: liftAll(op.ops, found) };
  if (op.op === 'branch') return liftBranch(op, found);
  if (op.op === 'switch') return liftSwitch(op, found);
  if (op.op === 'try') return liftTry(op, found);
  if (op.op === 'wait' || op.op === 'state_op') return liftWithScopes(op, found);
  return liftBodies(op, found);
}

function sortedValues(found: readonly ValueOp[]): Readonly<Record<string, ValueOp>> {
  const ordered = [...found].sort((left, right) => compareKeys(left.at.key, right.at.key));
  return Object.fromEntries(ordered.map((op) => [op.at.key, op]));
}

function compareKeys(left: string, right: string): number {
  if (left === right) return 0;
  return left < right ? -1 : 1;
}

export function normalisePlan(plan: Plan): NormalisedPlan {
  const found: ValueOp[] = [];
  const body = lift(plan.body, found);
  const onFailure = plan.onFailure === undefined ? undefined : lift(plan.onFailure, found);
  const { onFailure: _onFailure, ...rest } = plan;
  return {
    plan: { ...rest, body, ...(onFailure === undefined ? {} : { onFailure }) },
    values: sortedValues(found),
  };
}

function sortedJson(value: JsonValue): JsonValue {
  if (Array.isArray(value)) return value.map(sortedJson);
  if (typeof value !== 'object' || value === null) return value;
  const entries = Object.entries(value).sort(([left], [right]) => compareKeys(left, right));
  return Object.fromEntries(entries.map(([key, held]) => [key, sortedJson(held)]));
}

export function normalisedHash(plan: Plan): string {
  const json = JSON_VALUE.parse(JSON.parse(JSON.stringify(normalisePlan(plan))));
  return sha256Hex(JSON.stringify(sortedJson(json)));
}

export function comparePlans(before: Plan, after: Plan): PlanComparison {
  const beforeHash = normalisedHash(before);
  const afterHash = normalisedHash(after);
  return { equal: beforeHash === afterHash, beforeHash, afterHash };
}
