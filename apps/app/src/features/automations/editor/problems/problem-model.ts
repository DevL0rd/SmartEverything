import type { NodeRegistry } from '@smarteverything/domain';
import { nodeLabel } from '@smarteverything/domain';
import type { Finding, FindingSeverity, LintContext } from '@smarteverything/flow/check/lint';
import { lint } from '@smarteverything/flow/check/lint';
import type { ProgramIndex } from '@smarteverything/flow/program/lookup';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import type { ProblemInput } from '../../model/canvas/contract';
import type { InspectorFinding } from '../inspector/sections/section-types';
import { fixOpsOf } from './fix-actions';

export interface LiveFinding {
  readonly id: string;
  readonly nodeId: string | undefined;
  readonly finding: Finding;
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

export interface LiveCheck {
  readonly findings: readonly LiveFinding[];
  readonly scene: readonly ProblemInput[];
  readonly groups: readonly ProblemGroup[];
  readonly counts: ProblemCounts;
  readonly blocking: boolean;
}

export const PROGRAM_GROUP_TITLE = 'This automation';

function nodeIdOf(found: Finding, index: ProgramIndex): string | undefined {
  if (found.nodeId !== undefined) return found.nodeId;
  return found.key === undefined ? undefined : index.byKey.get(found.key)?.node.id;
}

export function checkProgram(program: Program, context: LintContext): readonly LiveFinding[] {
  const index = indexProgram(program);
  return lint(program, context).map((finding, position) => ({
    id: `${String(position)}:${finding.code}:${finding.nodeId ?? finding.key ?? 'program'}`,
    nodeId: nodeIdOf(finding, index),
    finding,
  }));
}

export function sceneProblems(live: readonly LiveFinding[]): readonly ProblemInput[] {
  return live.flatMap(({ nodeId, finding }): readonly ProblemInput[] => {
    if (nodeId === undefined || finding.severity === 'hint') return [];
    return [
      {
        nodeId,
        severity: finding.severity === 'error' ? 'critical' : 'warning',
        message: finding.message,
        ...(finding.port === undefined ? {} : { port: finding.port }),
      },
    ];
  });
}

export function inspectorFindings(
  live: readonly LiveFinding[],
  nodeId: string,
): readonly InspectorFinding[] {
  return live
    .filter((entry) => entry.nodeId === nodeId)
    .map(({ id, finding }) => ({
      id,
      severity: finding.severity,
      message: finding.message,
      port: finding.port,
      fix: finding.fix?.summary,
    }));
}

export function countsOf(live: readonly LiveFinding[]): ProblemCounts {
  const count = (severity: FindingSeverity): number =>
    live.filter((entry) => entry.finding.severity === severity).length;
  return { errors: count('error'), warnings: count('warning'), hints: count('hint') };
}

function titleOf(nodeId: string | null, index: ProgramIndex, registry: NodeRegistry): string {
  const entry = nodeId === null ? undefined : index.byId.get(nodeId);
  if (entry === undefined) return PROGRAM_GROUP_TITLE;
  return nodeLabel(entry.node, (kind) => registry.get(kind));
}

export function groupProblems(
  live: readonly LiveFinding[],
  program: Program,
  registry: NodeRegistry,
): readonly ProblemGroup[] {
  const index = indexProgram(program);
  const grouped = new Map<string, { nodeId: string | null; items: ProblemItem[] }>();
  for (const { id, nodeId, finding } of live) {
    const key = nodeId ?? 'program';
    const group = grouped.get(key) ?? { nodeId: nodeId ?? null, items: [] };
    group.items.push({
      id,
      severity: finding.severity,
      message: finding.message,
      port: finding.port,
      fix: finding.fix?.summary,
      fixable: fixOpsOf(program, finding) !== null,
    });
    grouped.set(key, group);
  }
  return [...grouped].map(([key, group]) => ({
    key,
    nodeId: group.nodeId,
    title: titleOf(group.nodeId, index, registry),
    items: group.items,
  }));
}

export function runLiveCheck(
  program: Program,
  context: LintContext,
  registry: NodeRegistry,
): LiveCheck {
  const findings = checkProgram(program, context);
  const counts = countsOf(findings);
  return {
    findings,
    scene: sceneProblems(findings),
    groups: groupProblems(findings, program, registry),
    counts,
    blocking: counts.errors > 0,
  };
}

export function findingById(check: LiveCheck, id: string): Finding | undefined {
  return check.findings.find((entry) => entry.id === id)?.finding;
}
