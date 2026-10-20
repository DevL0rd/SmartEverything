import type { FlowNode, Scope } from '@smarteverything/domain';
import type { Program } from '../program/walk';
import { CONTROL_LOWERING } from './lower-control';
import type {
  Frame,
  LowerKind,
  LowerProblem,
  Lowering,
  NodeLowering,
  ProblemDetail,
} from './lower-effects';
import { leafLowering, readerOf } from './lower-effects';
import type { Plan, PlanOp } from './plan';

export interface LowerContext {
  readonly kinds: (id: string) => LowerKind | undefined;
}

export type LowerResult =
  | { readonly ok: true; readonly plan: Plan }
  | { readonly ok: false; readonly problems: readonly LowerProblem[] };

const ROOT: Frame = { loops: [], durable: true };

const ON_ERROR_SCOPE = 'onError';

function problemOf(
  node: Pick<FlowNode, 'id' | 'key'>,
  code: LowerProblem['code'],
  message: string,
  detail: ProblemDetail,
): LowerProblem {
  return { nodeId: node.id, key: node.key, code, message, ...detail };
}

function lowering(context: LowerContext, problems: LowerProblem[], frame: Frame): Lowering {
  const low: Lowering = {
    frame,
    report: (node, code, message, detail = {}) => {
      problems.push(problemOf(node, code, message, detail));
    },
    scope: (scope, next) => scopeOps(context, problems, scope, next),
  };
  return low;
}

function loweringOf(node: FlowNode, kind: LowerKind): NodeLowering | undefined {
  return CONTROL_LOWERING[node.kind] ?? leafLowering(kind);
}

function routed(node: FlowNode, op: PlanOp, low: Lowering): PlanOp {
  const handler = node.scopes?.[ON_ERROR_SCOPE];
  if (node.policy?.onError !== 'route' || handler === undefined) return op;
  return {
    op: 'try',
    at: { id: node.id, key: node.key },
    body: op,
    catches: [{ id: node.id, then: low.scope(handler, low.frame) }],
  };
}

function nodeOp(
  context: LowerContext,
  problems: LowerProblem[],
  node: FlowNode,
  frame: Frame,
): PlanOp | undefined {
  const low = lowering(context, problems, frame);
  const kind = context.kinds(node.kind);
  if (kind === undefined) {
    low.report(node, 'unknown_kind', `no node kind is called "${node.kind}"`, {
      received: node.kind,
    });
    return undefined;
  }
  const lowered = loweringOf(node, kind);
  if (lowered === undefined) {
    low.report(node, 'not_supported', `${node.kind} cannot be part of a plan`, {
      received: kind.class,
      fix: 'remove it from the body',
    });
    return undefined;
  }
  return routed(node, lowered(readerOf(low, node, kind)), low);
}

function scopeOps(
  context: LowerContext,
  problems: LowerProblem[],
  scope: Scope | undefined,
  frame: Frame,
): PlanOp {
  const ops = (scope?.nodes ?? [])
    .filter((node) => node.enabled !== false)
    .map((node) => nodeOp(context, problems, node, frame))
    .filter((op): op is PlanOp => op !== undefined);
  return { op: 'seq', ops };
}

export function lower(program: Program, context: LowerContext): LowerResult {
  const problems: LowerProblem[] = [];
  const failure =
    program.kind === 'automation' ? scopeOrNone(context, problems, program.onFailure) : undefined;
  const plan: Plan = {
    version: 1,
    subject: program.kind,
    exits: program.kind === 'function' ? [...program.exits] : [],
    variables: [...program.variables],
    body: scopeOps(context, problems, program.body, ROOT),
    onFailure: failure,
  };
  return problems.length === 0 ? { ok: true, plan } : { ok: false, problems };
}

function scopeOrNone(
  context: LowerContext,
  problems: LowerProblem[],
  scope: Scope | undefined,
): PlanOp | undefined {
  return scope === undefined ? undefined : scopeOps(context, problems, scope, ROOT);
}
