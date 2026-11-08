import {
  LAYOUT,
  NODE_REGISTRY,
  STATIC_KIND_LOOKUP,
  PROGRAM_V3,
  PROGRAM_V4,
  graphRuleIssues,
  type Layout,
  type NodeLayout,
  type ProgramV4,
} from '@smarteverything/domain';
import { lower, type LowerContext } from '@smarteverything/flow/compile/lower';
import type { Plan } from '@smarteverything/flow/compile/plan';
import { layoutGraph } from '@smarteverything/flow/graph/layout';
import { canonicalise } from '@smarteverything/flow/graph/place-values';
import { comparePlans } from '@smarteverything/flow/graph/plan-normalise';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import { UnstructureRefusal, unstructure } from '@smarteverything/flow/graph/unstructure';
import { indexProgram } from '@smarteverything/flow/program/lookup';
import type { Program } from '@smarteverything/flow/program/walk';
import type { LogPayload } from '@smarteverything/logging';
import { jsonText, type Sql } from '../sql';
import { SOURCES, STORED, type Source, type Stored } from './automation-graphs-sources';
import type { Migration } from './migration';

export interface TraceSubject {
  readonly owner: string;
  readonly before: Plan;
  readonly after: Plan;
  readonly program: Program;
  readonly hoisted: boolean;
}

export type TraceVerdict =
  | { readonly status: 'not-run' }
  | {
      readonly status: 'equal' | 'skipped';
      readonly scenarios: number;
      readonly stepDeltas: readonly number[];
      readonly reason?: string;
    }
  | { readonly status: 'different'; readonly differences: readonly string[] };

export type TraceVerifier = (subject: TraceSubject) => TraceVerdict;

export interface ProgramReport {
  readonly store: string;
  readonly id: string;
  readonly revision: number;
  readonly owner: string;
  readonly nodesBefore: number;
  readonly nodesAfter: number;
  readonly planEqual: boolean;
  readonly canonicalEqual: boolean;
  readonly hoisted: boolean;
  readonly traces: TraceVerdict;
  readonly verdict: 'converted' | 'already-graph' | 'failed';
  readonly error?: string;
}

export class ProgramConversionError extends Error {
  override readonly name = 'ProgramConversionError';

  constructor(
    readonly owner: string,
    readonly stage: string,
    readonly detail: string,
    readonly node?: { readonly key: string; readonly id: string },
  ) {
    const where = node === undefined ? '' : ` at the node ${node.key} (${node.id})`;
    super(`${owner} cannot move to the graph (${stage})${where}: ${detail}. Nothing was migrated.`);
  }
}

interface Converted {
  readonly program: string;
  readonly layout: string;
  readonly report: Omit<ProgramReport, 'store' | 'id' | 'revision'>;
}

interface Pending {
  readonly source: Source;
  readonly row: Stored;
  readonly converted: Converted;
}

export interface GraphMigrationResult {
  readonly counts: Readonly<Record<string, number>>;
  readonly reports: readonly ProgramReport[];
}

const KINDS: LowerContext = { kinds: (id: string) => NODE_REGISTRY.get(id) };

function parseJson(owner: string, text: string, what: string): unknown {
  try {
    return JSON.parse(text);
  } catch (cause) {
    const reason = cause instanceof Error ? cause.message : String(cause);
    throw new ProgramConversionError(owner, 'read', `the stored ${what} is not JSON (${reason})`);
  }
}

function planOf(owner: string, tree: Program, stage: string): Plan {
  const lowered = lower(tree, KINDS);
  if (lowered.ok) return lowered.plan;
  const first = lowered.problems[0];
  const detail = lowered.problems.map((problem) => problem.message).join(' | ');
  throw new ProgramConversionError(
    owner,
    stage,
    detail,
    first === undefined ? undefined : { key: first.key, id: first.nodeId },
  );
}

function graphOf(owner: string, tree: Program): ProgramV4 {
  try {
    return unstructure(tree, STATIC_KIND_LOOKUP);
  } catch (cause) {
    if (cause instanceof UnstructureRefusal) {
      throw new ProgramConversionError(owner, 'unstructure', cause.message, {
        key: cause.key,
        id: cause.nodeId,
      });
    }
    throw cause;
  }
}

function validated(owner: string, graph: ProgramV4): void {
  const parsed = PROGRAM_V4.safeParse(graph);
  if (!parsed.success) {
    throw new ProgramConversionError(owner, 'schema', parsed.error.issues[0]?.message ?? 'invalid');
  }
  const issues = graphRuleIssues(graph, STATIC_KIND_LOOKUP);
  if (issues.length > 0) {
    throw new ProgramConversionError(
      owner,
      'graph rules',
      issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join(' | '),
    );
  }
}

function structuredTree(owner: string, graph: ProgramV4): Program {
  const structured = structuredOf(graph, STATIC_KIND_LOOKUP);
  if (structured.kind === 'structured') return structured.tree;
  const first = structured.problems[0];
  throw new ProgramConversionError(
    owner,
    'structure',
    structured.problems.map((problem) => problem.message).join(' | '),
    first?.key === undefined || first.nodeId === undefined
      ? undefined
      : { key: first.key, id: first.nodeId },
  );
}

function keepCollapsed(old: Layout, id: string, at: NodeLayout): NodeLayout {
  const collapsed = old.nodes[id]?.collapsed;
  return collapsed === undefined ? at : { ...at, collapsed };
}

function layoutOf(owner: string, graph: ProgramV4, old: Layout): Layout {
  const placed = layoutGraph(graph, { kinds: STATIC_KIND_LOOKUP, direction: 'ltr' });
  if (placed.problemCount > 0 || placed.remainder.length > 0) {
    throw new ProgramConversionError(
      owner,
      'layout',
      `${String(placed.remainder.length)} nodes got no place`,
    );
  }
  const nodes = Object.fromEntries(
    Object.entries(placed.nodes).map(([id, at]) => [id, keepCollapsed(old, id, at)]),
  );
  return { nodes, frames: old.frames, comments: old.comments };
}

function oldLayout(owner: string, text: string): Layout {
  const parsed = LAYOUT.safeParse(parseJson(owner, text, 'layout'));
  if (!parsed.success) {
    throw new ProgramConversionError(owner, 'read', 'the stored layout is not a layout');
  }
  return parsed.data;
}

function traced(
  owner: string,
  verifier: TraceVerifier | undefined,
  subject: TraceSubject,
): TraceVerdict {
  const verdict: TraceVerdict = verifier?.(subject) ?? { status: 'not-run' };
  if (verdict.status === 'different') {
    throw new ProgramConversionError(
      owner,
      'trace equality',
      verdict.differences.slice(0, 5).join(' | '),
    );
  }
  return verdict;
}

function alreadyGraph(row: Stored, graph: ProgramV4): Converted {
  validated(row.owner, graph);
  return {
    program: row.program,
    layout: row.layout,
    report: {
      owner: row.owner,
      nodesBefore: graph.nodes.length,
      nodesAfter: graph.nodes.length,
      planEqual: true,
      canonicalEqual: true,
      hoisted: false,
      traces: { status: 'not-run' },
      verdict: 'already-graph',
    },
  };
}

function wiring(graph: ProgramV4): string {
  const nodes = graph.nodes
    .map((node) => jsonText(Object.entries(node).filter(([field]) => field !== 'id')))
    .sort((left, right) => left.localeCompare(right));
  return jsonText({ ...graph, nodes });
}

function sameGraph(left: ProgramV4, right: ProgramV4): boolean {
  return wiring(left) === wiring(right);
}

function hoistProof(owner: string, tree: Program, graph: ProgramV4): void {
  if (sameGraph(graph, graphOf(owner, canonicalise(tree, STATIC_KIND_LOOKUP)))) return;
  throw new ProgramConversionError(
    owner,
    'plan equality',
    'the canonical form of the program is a different graph, so it is not a pure move of the nodes after a decision',
  );
}

function convertTree(row: Stored, tree: Program, verifier?: TraceVerifier): Converted {
  const { owner } = row;
  const before = planOf(owner, tree, 'lower the stored program');
  const canonicalPlan = planOf(owner, canonicalise(tree, STATIC_KIND_LOOKUP), 'lower canonical');
  const canonical = comparePlans(before, canonicalPlan);
  const graph = graphOf(owner, tree);
  validated(owner, graph);
  const after = planOf(owner, structuredTree(owner, graph), 'lower the graph');
  const compared = comparePlans(canonicalPlan, after);
  if (!compared.equal) {
    throw new ProgramConversionError(
      owner,
      'plan equality',
      `the plan hash differs after normalisation (before ${compared.beforeHash}, after ${compared.afterHash})`,
    );
  }
  if (!canonical.equal) hoistProof(owner, tree, graph);
  const layout = layoutOf(owner, graph, oldLayout(owner, row.layout));
  return {
    program: jsonText(graph),
    layout: jsonText(layout),
    report: {
      owner,
      nodesBefore: indexProgram(tree).nodes.length,
      nodesAfter: graph.nodes.length,
      planEqual: compared.equal,
      canonicalEqual: canonical.equal,
      hoisted: !canonical.equal,
      traces: traced(owner, verifier, {
        owner,
        before,
        after,
        program: tree,
        hoisted: !canonical.equal,
      }),
      verdict: 'converted',
    },
  };
}

function convertRow(row: Stored, verifier?: TraceVerifier): Converted {
  const stored = parseJson(row.owner, row.program, 'program');
  const asGraph = PROGRAM_V4.safeParse(stored);
  if (asGraph.success) return alreadyGraph(row, asGraph.data);
  const parsed = PROGRAM_V3.safeParse(stored);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw new ProgramConversionError(
      row.owner,
      'read',
      `it is neither a version 3 nor a version 4 program (${issue?.path.join('.') ?? ''}: ${issue?.message ?? ''})`,
    );
  }
  return convertTree(row, parsed.data, verifier);
}

function keyOf(source: Source, row: Stored): Readonly<Record<string, string | number>> {
  return source.byRevision ? { id: row.id, revision: row.revision } : { id: row.id };
}

function pendingOf(sql: Sql, verifier?: TraceVerifier): readonly Pending[] {
  return SOURCES.flatMap((source) =>
    sql
      .all(STORED, source.select)
      .map((row) => ({ source, row, converted: convertRow(row, verifier) })),
  );
}

function write(sql: Sql, pending: Pending): number {
  const { source, row, converted } = pending;
  const parameters = {
    ...keyOf(source, row),
    program: converted.program,
    layout: converted.layout,
  };
  return sql.run(`move ${row.owner} to the graph`, source.update, parameters);
}

export function convertStoredPrograms(sql: Sql, verifier?: TraceVerifier): GraphMigrationResult {
  const pending = pendingOf(sql, verifier);
  const counts: Record<string, number> = {};
  for (const item of pending) {
    const label = item.source.label;
    counts[label] = (counts[label] ?? 0) + write(sql, item);
  }
  return { counts, reports: pending.map(reportOf) };
}

function reportOf({ source, row, converted }: Pending): ProgramReport {
  return { store: source.label, id: row.id, revision: row.revision, ...converted.report };
}

function failedReport(source: Source, row: Stored, error: ProgramConversionError): ProgramReport {
  return {
    store: source.label,
    id: row.id,
    revision: row.revision,
    owner: row.owner,
    nodesBefore: 0,
    nodesAfter: 0,
    planEqual: false,
    canonicalEqual: false,
    hoisted: false,
    traces: { status: 'not-run' },
    verdict: 'failed',
    error: error.message,
  };
}

export function surveyStoredPrograms(sql: Sql, verifier?: TraceVerifier): readonly ProgramReport[] {
  return SOURCES.flatMap((source) =>
    sql.all(STORED, source.select).map((row) => {
      try {
        return reportOf({ source, row, converted: convertRow(row, verifier) });
      } catch (cause) {
        if (cause instanceof ProgramConversionError) return failedReport(source, row, cause);
        throw cause;
      }
    }),
  );
}

export const TRACE_EQUALITY_NOTE =
  'not run inside the migration (the step harness is test code); proven on a copy of the database before the release';

export function moveProgramsToGraphs(sql: Sql): LogPayload {
  const { counts, reports } = convertStoredPrograms(sql);
  return {
    ...counts,
    hoisted: reports.filter((report) => report.hoisted).length,
    traceEquality: TRACE_EQUALITY_NOTE,
  };
}

export function automationGraphsMigration(version: number): Migration {
  return { version, name: 'automation_graphs', statements: [], backfill: moveProgramsToGraphs };
}
