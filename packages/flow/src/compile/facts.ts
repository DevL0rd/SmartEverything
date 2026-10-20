import type { CalleeRef, Manifest, ManifestKinds, ResolvePlan } from './manifest';
import { calleeLabel, callsIn, closureOf, manifestOf, planOps, walkOps } from './manifest';
import type { Plan, PlanOp } from './plan';
import type { At, WaitSpec } from './plan-parts';
import type { ReadSite } from './reads';
import { CONDITION_PORT, readSites } from './reads';

export interface LoopFact {
  readonly at: At;
  readonly canSuspend: boolean;
  readonly gap: boolean;
}

export interface WaitFact {
  readonly at: At;
  readonly kind: WaitSpec['kind'];
  readonly durable: boolean;
  readonly keys: readonly string[];
}

export interface PlanFacts {
  readonly manifest: Manifest;
  readonly ownerOnly: boolean;
  readonly calls: readonly CalleeRef[];
  readonly runs: readonly string[];
  readonly loops: readonly LoopFact[];
  readonly waits: readonly WaitFact[];
  readonly reads: readonly ReadSite[];
}

export interface FactsContext {
  readonly kinds: ManifestKinds;
  readonly plans: ResolvePlan;
}

function parksItself(op: PlanOp): boolean {
  if (op.op === 'set_var') return op.source !== 'run';
  if (op.op === 'loop') return op.gap !== undefined;
  return op.op === 'wait' || op.op === 'effect' || op.op === 'with_effect' || op.op === 'run';
}

function suspensionOf(context: FactsContext): (callee: CalleeRef) => boolean {
  const known = new Map<string, boolean>();
  return (callee) => {
    const label = calleeLabel(callee);
    const held = known.get(label);
    if (held !== undefined) return held;
    const plan = context.plans(callee);
    const parks =
      plan !== undefined &&
      closureOf(plan, context.plans).plans.some((member) => planOps(member).some(parksItself));
    known.set(label, parks);
    return parks;
  };
}

function bodyCanSuspend(body: PlanOp, callSuspends: (callee: CalleeRef) => boolean): boolean {
  const ops = walkOps(body);
  return (
    ops.some(parksItself) ||
    ops.some((op) => op.op === 'call' && callSuspends({ fn: op.fn, pin: op.pin }))
  );
}

function loopFacts(plan: Plan, context: FactsContext): readonly LoopFact[] {
  const callSuspends = suspensionOf(context);
  return planOps(plan).flatMap((op) =>
    op.op === 'loop'
      ? [
          {
            at: op.at,
            canSuspend: bodyCanSuspend(op.body, callSuspends),
            gap: op.gap !== undefined,
          },
        ]
      : [],
  );
}

function waitFacts(plan: Plan, reads: readonly ReadSite[]): readonly WaitFact[] {
  return planOps(plan).flatMap((op) => {
    if (op.op !== 'wait') return [];
    const site = reads.find((read) => read.at.id === op.at.id && read.port === CONDITION_PORT);
    return [{ at: op.at, kind: op.wait.kind, durable: op.durable, keys: site?.keys ?? [] }];
  });
}

function runTargets(plan: Plan): readonly string[] {
  const targets = planOps(plan).flatMap((op) => (op.op === 'run' ? [op.automation] : []));
  return [...new Set(targets)].sort();
}

export function factsOf(plan: Plan, context: FactsContext): PlanFacts {
  const manifest = manifestOf(plan, context.kinds, context.plans);
  const reads = readSites(plan, context.kinds);
  return {
    manifest,
    ownerOnly: manifest.owner,
    calls: callsIn(plan),
    runs: runTargets(plan),
    loops: loopFacts(plan, context),
    waits: waitFacts(plan, reads),
    reads,
  };
}
