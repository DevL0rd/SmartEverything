import type { FlowNode, FunctionV3 } from '@smarteverything/domain';
import type { ScopePath } from '../program/paths';
import type { Program, ScopeRef } from '../program/walk';
import { childScopeRefs, rootScopes } from '../program/walk';
import { freshFrame, ordinalsOf } from './same-steps-canon';
import { sameNodes } from './same-steps-compare';

export const MIN_SAME_STEPS = 2;

export interface SameStepsCandidate {
  readonly id: string;
  readonly name: string;
  readonly program: Program;
}

export interface SameStepsMatch {
  readonly id: string;
  readonly name: string;
  readonly scope: ScopePath;
  readonly keys: readonly string[];
  readonly nodeIds: readonly string[];
}

function patternOf(callee: FunctionV3): readonly FlowNode[] {
  const nodes = callee.body.nodes;
  return nodes.at(-1)?.kind === 'flow.return' ? nodes.slice(0, -1) : nodes;
}

function scopesOf(program: Program): readonly ScopeRef[] {
  const found: ScopeRef[] = [];
  const visit = (ref: ScopeRef): void => {
    found.push(ref);
    ref.scope.nodes.forEach((node, index) => {
      for (const child of childScopeRefs(node, [...ref.storage, 'nodes', index])) visit(child);
    });
  };
  rootScopes(program).forEach(visit);
  return found;
}

function scanScope(
  candidate: SameStepsCandidate,
  ref: ScopeRef,
  pattern: readonly FlowNode[],
  ordinals: ReadonlyMap<string, number>,
): readonly SameStepsMatch[] {
  const found: SameStepsMatch[] = [];
  const nodes = ref.scope.nodes;
  let start = 0;
  while (start + pattern.length <= nodes.length) {
    const window = nodes.slice(start, start + pattern.length);
    const frame = freshFrame(ordinals, ordinalsOf(window));
    if (sameNodes(pattern, window, frame)) {
      found.push({
        id: candidate.id,
        name: candidate.name,
        scope: ref.path,
        keys: window.map((node) => node.key),
        nodeIds: window.map((node) => node.id),
      });
      start += pattern.length;
    } else {
      start += 1;
    }
  }
  return found;
}

export function findSameSteps(
  callee: FunctionV3,
  candidates: readonly SameStepsCandidate[],
): readonly SameStepsMatch[] {
  const pattern = patternOf(callee);
  const ordinals = ordinalsOf(pattern);
  if (ordinals.size < MIN_SAME_STEPS) return [];
  return candidates.flatMap((candidate) =>
    scopesOf(candidate.program).flatMap((ref) => scanScope(candidate, ref, pattern, ordinals)),
  );
}
