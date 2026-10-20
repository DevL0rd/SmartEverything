import type {
  Branch,
  CatchRow,
  FlowNode,
  PortValue,
  Scope,
  StructuredOutput,
  SwitchCase,
  SwitchMatch,
} from '@smarteverything/domain';
import type { Frame } from './same-steps-canon';
import { canonical, stableJson, wildcardOf } from './same-steps-canon';

type Ports = Readonly<Record<string, PortValue>>;

function sameValue(pattern: PortValue, candidate: PortValue, frame: Frame): boolean {
  const name = wildcardOf(pattern);
  if (name === undefined) {
    return canonical(pattern, 'pattern', frame) === canonical(candidate, 'candidate', frame);
  }
  const bound = canonical(candidate, 'candidate', frame, true);
  const known = frame.bindings.get(name);
  if (known === undefined) frame.bindings.set(name, bound);
  return known === undefined || known === bound;
}

function sameKeys(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((name, index) => name === right[index]);
}

function sortedNames(record: Ports | undefined): readonly string[] {
  return Object.keys(record ?? {}).sort();
}

function sameRecord(
  pattern: Ports | undefined,
  candidate: Ports | undefined,
  frame: Frame,
): boolean {
  const names = sortedNames(pattern);
  if (!sameKeys(names, sortedNames(candidate))) return false;
  return names.every((name) => {
    const left = pattern?.[name];
    const right = candidate?.[name];
    return left !== undefined && right !== undefined && sameValue(left, right, frame);
  });
}

function sameMatch(pattern: SwitchMatch, candidate: SwitchMatch, frame: Frame): boolean {
  if ('when' in pattern)
    return 'when' in candidate && sameValue(pattern.when, candidate.when, frame);
  return !('when' in candidate) && stableJson(pattern) === stableJson(candidate);
}

function sameRows<Row>(
  pattern: readonly Row[] | undefined,
  candidate: readonly Row[] | undefined,
  same: (left: Row, right: Row) => boolean,
): boolean {
  const left = pattern ?? [];
  const right = candidate ?? [];
  return (
    left.length === right.length &&
    left.every((row, index) => {
      const other = right[index];
      return other !== undefined && same(row, other);
    })
  );
}

export function sameNodes(
  pattern: readonly FlowNode[],
  candidate: readonly FlowNode[],
  frame: Frame,
): boolean {
  return sameRows(pattern, candidate, (left, right) => sameNode(left, right, frame));
}

function sameScope(pattern: Scope, candidate: Scope, frame: Frame): boolean {
  return sameNodes(pattern.nodes, candidate.nodes, frame);
}

function sameBranch(left: Branch, right: Branch, frame: Frame): boolean {
  return sameValue(left.when, right.when, frame) && sameScope(left.scope, right.scope, frame);
}

function sameCase(left: SwitchCase, right: SwitchCase, frame: Frame): boolean {
  return sameMatch(left.match, right.match, frame) && sameScope(left.scope, right.scope, frame);
}

function sameCatch(left: CatchRow, right: CatchRow, frame: Frame): boolean {
  return (
    stableJson(left.classes ?? null) === stableJson(right.classes ?? null) &&
    sameScope(left.scope, right.scope, frame)
  );
}

function sameOutput(left: StructuredOutput, right: StructuredOutput, frame: Frame): boolean {
  return (
    left.name === right.name &&
    stableJson(left.type) === stableJson(right.type) &&
    sameRecord(left.values, right.values, frame)
  );
}

function sameScopes(
  pattern: Readonly<Record<string, Scope>> | undefined,
  candidate: Readonly<Record<string, Scope>> | undefined,
  frame: Frame,
): boolean {
  const names = Object.keys(pattern ?? {}).sort();
  if (!sameKeys(names, Object.keys(candidate ?? {}).sort())) return false;
  return names.every((name) => {
    const left = pattern?.[name];
    const right = candidate?.[name];
    return left !== undefined && right !== undefined && sameScope(left, right, frame);
  });
}

function sameShell(pattern: FlowNode, candidate: FlowNode): boolean {
  return (
    pattern.kind === candidate.kind &&
    (pattern.enabled ?? true) === (candidate.enabled ?? true) &&
    stableJson(pattern.policy) === stableJson(candidate.policy)
  );
}

function sameChildren(pattern: FlowNode, candidate: FlowNode, frame: Frame): boolean {
  return (
    sameRows(pattern.branches, candidate.branches, (a, b) => sameBranch(a, b, frame)) &&
    sameRows(pattern.cases, candidate.cases, (a, b) => sameCase(a, b, frame)) &&
    sameRows(pattern.catches, candidate.catches, (a, b) => sameCatch(a, b, frame)) &&
    sameScopes(pattern.scopes, candidate.scopes, frame) &&
    sameRows(pattern.outputs, candidate.outputs, (a, b) => sameOutput(a, b, frame))
  );
}

export function sameNode(pattern: FlowNode, candidate: FlowNode, frame: Frame): boolean {
  return (
    sameShell(pattern, candidate) &&
    sameRecord(pattern.ports, candidate.ports, frame) &&
    sameChildren(pattern, candidate, frame)
  );
}
