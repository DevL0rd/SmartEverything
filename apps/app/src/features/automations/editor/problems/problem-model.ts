import type { NodeKindLookup } from '@smarteverything/domain';
import {
  nodeLabel,
  upperFirst,
  type GraphNode,
  type NodeRegistry,
  type ProgramV4,
  type TriggerNode,
} from '@smarteverything/domain';
import type { FindingSeverity, LintAction, LintContext } from '@smarteverything/flow/check/lint';
import { lint } from '@smarteverything/flow/check/lint';
import type { GraphProblem } from '@smarteverything/flow/graph/problem-types';
import type { ProgramIndex } from '@smarteverything/flow/program/lookup';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import { structuredFor } from '../../model/editor/structured';
import type { SceneProblemEntry } from '../../model/graph/scene-contract';
import type { InspectorFinding } from '../inspector/sections/section-types';
import { fixOpsOf } from './fix-actions';

export interface LiveFinding {
  readonly id: string;
  readonly nodeId: string | undefined;
  readonly severity: FindingSeverity;
  readonly code: string;
  readonly message: string;
  readonly port: string | undefined;
  readonly fix: string | undefined;
  readonly action: LintAction | undefined;
}

export interface ProblemItem {
  readonly id: string;
  readonly severity: FindingSeverity;
  readonly message: string;
  readonly port: string | undefined;
  readonly fix: string | undefined;
  readonly fixable: boolean;
}

export interface ProblemGroup {
  readonly key: string;
  readonly nodeId: string | null;
  readonly title: string;
  readonly items: readonly ProblemItem[];
}

export interface ProblemCounts {
  readonly errors: number;
  readonly warnings: number;
  readonly hints: number;
}

export function countsText(counts: ProblemCounts): string | null {
  const parts = [
    counts.errors === 0 ? null : `${String(counts.errors)} to fix`,
    counts.warnings === 0 ? null : `${String(counts.warnings)} to know`,
    counts.hints === 0 ? null : `${String(counts.hints)} to improve`,
  ].filter((part) => part !== null);
  return parts.length === 0 ? null : parts.join(', ');
}

export interface LiveCheck {
  readonly findings: readonly LiveFinding[];
  readonly scene: readonly SceneProblemEntry[];
  readonly groups: readonly ProblemGroup[];
  readonly counts: ProblemCounts;
  readonly blocking: boolean;
}

export const PROGRAM_GROUP_TITLE = 'This automation';

export const OPEN_TO_FIX = 'Open the step to fix it.';

function idOf(position: number, code: string, subject: string | undefined): string {
  return `${String(position)}:${code}:${subject ?? 'program'}`;
}

function nodeIdOf(
  found: { readonly nodeId?: string | undefined; readonly key?: string | undefined },
  index: ProgramIndex,
): string | undefined {
  if (found.nodeId !== undefined) return found.nodeId;
  return found.key === undefined ? undefined : index.byKey.get(found.key)?.node.id;
}

function lintFindings(tree: Program, context: LintContext): readonly LiveFinding[] {
  const index = indexProgram(tree);
  return lint(tree, context).map((finding, position) => {
    const nodeId = nodeIdOf(finding, index);
    return {
      id: idOf(position, finding.code, finding.nodeId ?? finding.key),
      nodeId,
      severity: finding.severity,
      code: finding.code,
      message: finding.message,
      port: finding.port,
      fix: finding.fix === undefined ? undefined : upperFirst(finding.fix.summary),
      action: finding.fix?.action,
    };
  });
}

function structureFindings(problems: readonly GraphProblem[]): readonly LiveFinding[] {
  return problems.map((problem, position) => ({
    id: idOf(position, problem.code, problem.nodeId ?? problem.key),
    nodeId: problem.nodeId,
    severity: 'error',
    code: problem.code,
    message: problem.message,
    port: problem.wire?.port ?? problem.port,
    fix: problem.fix,
    action: undefined,
  }));
}

export function checkProgram(
  program: ProgramV4,
  context: LintContext,
  kinds: NodeKindLookup,
): readonly LiveFinding[] {
  const structured = structuredFor(program, kinds);
  return structured.kind === 'structured'
    ? lintFindings(structured.tree, context)
    : structureFindings(structured.problems);
}

export function sceneProblems(live: readonly LiveFinding[]): readonly SceneProblemEntry[] {
  return live.flatMap(({ nodeId, severity, code, message, fix }): readonly SceneProblemEntry[] => {
    if (nodeId === undefined || severity !== 'error') return [];
    return [{ nodeId, code, message, fix: fix ?? OPEN_TO_FIX }];
  });
}

export function inspectorFindings(
  live: readonly LiveFinding[],
  nodeId: string,
): readonly InspectorFinding[] {
  return live
    .filter((entry) => entry.nodeId === nodeId)
    .map(({ id, severity, message, port, fix }) => ({ id, severity, message, port, fix }));
}

export function countsOf(live: readonly LiveFinding[]): ProblemCounts {
  const count = (severity: FindingSeverity): number =>
    live.filter((entry) => entry.severity === severity).length;
  return { errors: count('error'), warnings: count('warning'), hints: count('hint') };
}

function holderOf(program: ProgramV4, nodeId: string | null): GraphNode | TriggerNode | undefined {
  if (nodeId === null) return undefined;
  const triggers = program.kind === 'automation' ? program.triggers : [];
  return [...program.nodes, ...triggers].find((item) => item.id === nodeId);
}

function titleOf(nodeId: string | null, program: ProgramV4, registry: NodeRegistry): string {
  const holder = holderOf(program, nodeId);
  if (holder === undefined) return PROGRAM_GROUP_TITLE;
  return nodeLabel(holder, (kind) => registry.get(kind));
}

export function groupProblems(
  live: readonly LiveFinding[],
  program: ProgramV4,
  registry: NodeRegistry,
): readonly ProblemGroup[] {
  const grouped = new Map<string, { nodeId: string | null; items: ProblemItem[] }>();
  for (const found of live) {
    const key = found.nodeId ?? 'program';
    const group = grouped.get(key) ?? { nodeId: found.nodeId ?? null, items: [] };
    group.items.push({
      id: found.id,
      severity: found.severity,
      message: found.message,
      port: found.port,
      fix: found.fix,
      fixable: fixOpsOf(program, found, registry) !== null,
    });
    grouped.set(key, group);
  }
  return [...grouped].map(([key, group]) => ({
    key,
    nodeId: group.nodeId,
    title: titleOf(group.nodeId, program, registry),
    items: group.items,
  }));
}

export function runLiveCheck(
  program: ProgramV4,
  context: LintContext,
  registry: NodeRegistry,
): LiveCheck {
  const findings = checkProgram(program, context, registry);
  const counts = countsOf(findings);
  const structured = structuredFor(program, registry).kind === 'structured';
  return {
    findings,
    scene: structured ? sceneProblems(findings) : [],
    groups: groupProblems(findings, program, registry),
    counts,
    blocking: counts.errors > 0,
  };
}

export function findingById(check: LiveCheck, id: string): LiveFinding | undefined {
  return check.findings.find((entry) => entry.id === id);
}
