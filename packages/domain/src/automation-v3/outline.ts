import { humanizeEnum } from '../presentation/humanize';
import {
  nodeSummaryText,
  plainWire,
  wireScopeOf,
  type DescribeContext,
  type WireScope,
} from './describe';
import { nodeLabel } from './describe-context';
import { literalText } from './describe-values';
import type { FlowNode, Scope, SwitchMatch, TriggerNode } from './node';
import type { PortValue } from './port-value';
import type { ProgramV3 } from './program';

export type OutlineLineKind = 'trigger' | 'admit' | 'data' | 'node' | 'scope';

export interface OutlineLine {
  readonly depth: number;
  readonly kind: OutlineLineKind;
  readonly key: string | null;
  readonly nodeId: string | null;
  readonly label: string | null;
  readonly summary: string;
  readonly text: string;
}

interface Walk {
  readonly ctx: DescribeContext;
  readonly scope: WireScope;
  readonly lines: OutlineLine[];
}

const INDENT = '  ';

function valueWords(value: PortValue, walk: Walk): string {
  if ('lit' in value) return literalText(undefined, value.lit, walk.ctx.names);
  return plainWire(value.wire, walk.scope);
}

function matchWords(match: SwitchMatch, walk: Walk): string {
  if ('eq' in match) return `is ${literalText(undefined, match.eq, walk.ctx.names)}`;
  if ('in' in match) {
    return `is one of ${match.in.map((item) => literalText(undefined, item, walk.ctx.names)).join(', ')}`;
  }
  if ('when' in match) return `when ${valueWords(match.when, walk)}`;
  const { min, max } = match.range;
  if (min !== undefined && max !== undefined) return `is between ${String(min)} and ${String(max)}`;
  return min === undefined ? `is at most ${String(max)}` : `is at least ${String(min)}`;
}

interface Lane {
  readonly header: string;
  readonly scope: Scope;
}

function catchWords(classes: readonly string[] | undefined): string {
  return classes === undefined
    ? 'catch any error:'
    : `catch ${classes.map((name) => humanizeEnum(name).toLowerCase()).join(', ')}:`;
}

function lanesOf(node: FlowNode, walk: Walk): readonly Lane[] {
  return [
    ...Object.entries(node.scopes ?? {}).map(([name, scope]) => ({
      header: `${humanizeEnum(name).toLowerCase()}:`,
      scope,
    })),
    ...(node.branches ?? []).map((row) => ({
      header: `if ${valueWords(row.when, walk)}:`,
      scope: row.scope,
    })),
    ...(node.cases ?? []).map((row) => ({
      header: `case ${matchWords(row.match, walk)}:`,
      scope: row.scope,
    })),
    ...(node.catches ?? []).map((row) => ({ header: catchWords(row.classes), scope: row.scope })),
  ];
}

function offSuffix(node: { readonly enabled?: boolean | undefined }): string {
  return node.enabled === false ? ' (off)' : '';
}

function plainLine(depth: number, kind: OutlineLineKind, summary: string): OutlineLine {
  return { depth, kind, key: null, nodeId: null, label: null, summary, text: summary };
}

function keyedLine(
  depth: number,
  kind: 'trigger' | 'node',
  node: FlowNode | TriggerNode,
  walk: Walk,
): OutlineLine {
  const summary = `${nodeSummaryText(node, walk.ctx, walk.scope)}${offSuffix(node)}`;
  const prefix = kind === 'trigger' ? `when ${node.key}` : node.key;
  return {
    depth,
    kind,
    key: node.key,
    nodeId: node.id,
    label: nodeLabel(node, walk.ctx.kinds),
    summary,
    text: `${prefix}: ${summary}`,
  };
}

function walkScope(scope: Scope, depth: number, walk: Walk): void {
  for (const node of scope.nodes) {
    walk.lines.push(keyedLine(depth, 'node', node, walk));
    for (const lane of lanesOf(node, walk)) {
      walk.lines.push({ ...plainLine(depth + 1, 'scope', lane.header), nodeId: node.id });
      walkScope(lane.scope, depth + 2, walk);
    }
  }
}

function triggerLines(program: ProgramV3, walk: Walk): void {
  if (program.kind !== 'automation') return;
  for (const trigger of program.triggers) walk.lines.push(keyedLine(0, 'trigger', trigger, walk));
  if (program.admit !== undefined) {
    walk.lines.push(plainLine(0, 'admit', `only if ${valueWords(program.admit, walk)}`));
  }
}

function keptLines(program: ProgramV3, walk: Walk): void {
  if (program.kind !== 'function') return;
  for (const variable of program.variables) {
    if (variable.persist !== true) continue;
    const start = valueWords(variable.initial, walk);
    walk.lines.push(
      plainLine(
        0,
        'data',
        `keeps for each use, between runs: ${variable.name} (${variable.type.t}, starts at ${start})`,
      ),
    );
  }
}

export function outlineLines(program: ProgramV3, ctx: DescribeContext): readonly OutlineLine[] {
  const walk: Walk = { ctx, scope: wireScopeOf(program, ctx), lines: [] };
  triggerLines(program, walk);
  keptLines(program, walk);
  walkScope(program.body, 0, walk);
  if (program.kind === 'automation' && program.onFailure !== undefined) {
    walk.lines.push(plainLine(0, 'scope', 'if the run fails:'));
    walkScope(program.onFailure, 1, walk);
  }
  return walk.lines;
}

export function outlineText(lines: readonly OutlineLine[]): string {
  return lines.map((line) => `${INDENT.repeat(line.depth)}${line.text}`).join('\n');
}

export function outlineOf(program: ProgramV3, ctx: DescribeContext): string {
  return outlineText(outlineLines(program, ctx));
}
