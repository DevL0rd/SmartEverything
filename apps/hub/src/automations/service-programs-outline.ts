import {
  execClassOf,
  execPortsOf,
  nodeSummaryText,
  portText,
  wireScopeOf,
  type DescribeContext,
  type ExecOutput,
  type GraphNode,
  type NodeKindLookup,
  type ProgramV4,
  type WireScope,
} from '@smarteverything/domain';
import type { GraphProblem } from '@smarteverything/flow/graph/problem-types';
import { structuredOf } from '@smarteverything/flow/graph/structured-of';
import { walkProgram, type Program } from '@smarteverything/flow/program/walk';
import { flatAutomation, flatFunction } from '../store/repositories/automation-trees';

const NEXT = 'next';
const END = 'end';
const SEPARATOR = ' · ';

interface Walk {
  readonly ctx: DescribeContext;
  readonly kinds: NodeKindLookup;
  readonly scope: WireScope;
}

function flatTreeOf(program: ProgramV4): Program {
  return program.kind === 'automation' ? flatAutomation(program) : flatFunction(program);
}

function conditionOf(node: GraphNode, output: ExecOutput, walk: Walk): string {
  const row = (node.branches ?? []).find((candidate) => output.port === `row:${candidate.id}`);
  if (row === undefined) return '';
  return `(${portText(row.when, undefined, walk.ctx.names, walk.scope)})`;
}

function wireWords(node: GraphNode, output: ExecOutput, walk: Walk): string {
  const label = `${output.label.toLowerCase()}${conditionOf(node, output, walk)}`;
  return `${label} → ${output.target ?? END}`;
}

function wiresOf(node: GraphNode, walk: Walk): string {
  const { outputs } = execPortsOf(node.kind, node, walk.kinds);
  const [only] = outputs;
  if (only !== undefined && outputs.length === 1 && only.port === NEXT) {
    return ` → then ${only.target ?? END}`;
  }
  if (outputs.length === 0) return '';
  return `${SEPARATOR}${outputs.map((output) => wireWords(node, output, walk)).join(SEPARATOR)}`;
}

function nodeLine(node: GraphNode, walk: Walk): string {
  const summary = nodeSummaryText(node, walk.ctx, walk.scope);
  const off = node.enabled === false ? ' (off)' : '';
  return `${node.key}${SEPARATOR}${summary}${off}${wiresOf(node, walk)}`;
}

function headerLines(program: ProgramV4, walk: Walk): readonly string[] {
  if (program.kind !== 'automation') return [];
  const triggers = program.triggers.map(
    (trigger) => `when ${trigger.key}: ${nodeSummaryText(trigger, walk.ctx, walk.scope)}`,
  );
  const admit =
    program.admit === undefined
      ? []
      : [`only if ${portText(program.admit, undefined, walk.ctx.names, walk.scope)}`];
  return [...triggers, ...admit];
}

function structuredOrder(program: ProgramV4, tree: Program, kinds: NodeKindLookup): string[] {
  const walked = walkProgram(tree).map(({ node }) => node.key);
  const starts = program.nodes
    .filter((node) => execClassOf(node.kind, kinds) === 'start')
    .map((node) => node.key);
  const placed = new Set([...starts, ...walked]);
  const rest = program.nodes.map((node) => node.key).filter((key) => !placed.has(key));
  return [...starts, ...walked, ...rest];
}

function problemLines(problems: readonly GraphProblem[]): readonly string[] {
  const count = String(problems.length);
  const head = `Not a valid graph yet: ${count} ${problems.length === 1 ? 'problem' : 'problems'}`;
  return [head, ...problems.map((problem) => `- ${problem.message}`)];
}

export function graphOutline(
  program: ProgramV4,
  ctx: DescribeContext,
  kinds: NodeKindLookup,
): string {
  const tree = flatTreeOf(program);
  const walk: Walk = { ctx, kinds, scope: wireScopeOf(tree, ctx) };
  const structured = structuredOf(program, kinds);
  const byKey = new Map(program.nodes.map((node) => [node.key, node]));
  const keys =
    structured.kind === 'structured'
      ? structuredOrder(program, structured.tree, kinds)
      : program.nodes.map((node) => node.key);
  const lines = keys.flatMap((key) => {
    const node = byKey.get(key);
    return node === undefined ? [] : [nodeLine(node, walk)];
  });
  const problems = structured.kind === 'unstructured' ? problemLines(structured.problems) : [];
  return [...problems, ...headerLines(program, walk), ...lines].join('\n');
}
