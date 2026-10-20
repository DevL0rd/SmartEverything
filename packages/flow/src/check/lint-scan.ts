import type { FlowNode, JsonValue } from '@smarteverything/domain';
import type { NodeEntry, ProgramIndex } from '../program/lookup';
import type { Subject } from './problems';
import type { LintContext } from './lint-types';

export const LOOP_KINDS: ReadonlySet<string> = new Set([
  'flow.for_each',
  'flow.repeat',
  'flow.for_range',
  'flow.while',
  'flow.do_until',
  'flow.forever',
]);

export const WAIT_KINDS: ReadonlySet<string> = new Set([
  'flow.wait',
  'flow.wait_until_time',
  'flow.wait_event',
  'flow.wait_condition',
]);

export const VARIABLE_WRITE_KINDS: ReadonlySet<string> = new Set(['var.set', 'var.change']);

export function literalOf(node: FlowNode, port: string): JsonValue | undefined {
  const value = node.ports?.[port];
  return value !== undefined && 'lit' in value ? value.lit : undefined;
}

export function textOf(node: FlowNode, port: string): string | undefined {
  const value = literalOf(node, port);
  return typeof value === 'string' && value !== '' ? value : undefined;
}

export function numberOf(node: FlowNode, port: string): number | undefined {
  const value = literalOf(node, port);
  return typeof value === 'number' ? value : undefined;
}

export function hasPort(node: FlowNode, port: string): boolean {
  return node.ports?.[port] !== undefined;
}

export function subjectOf(node: FlowNode): Subject {
  return { nodeId: node.id, key: node.key };
}

export function descendantsOf(index: ProgramIndex, key: string): readonly NodeEntry[] {
  return index.nodes.filter((entry) => entry.ancestors.includes(key));
}

export function entriesOfKind(
  index: ProgramIndex,
  ...kinds: readonly string[]
): readonly NodeEntry[] {
  return index.nodes.filter((entry) => kinds.includes(entry.node.kind));
}

export function isActive(entry: NodeEntry, ctx: LintContext): boolean {
  return ctx.kinds(entry.node.kind)?.class === 'effect' || entry.node.kind === 'fn.call';
}

export function issuesCommands(entry: NodeEntry, ctx: LintContext): boolean {
  return ctx.kinds(entry.node.kind)?.effect?.budget === 'command';
}

export function writtenVariable(node: FlowNode, persistent: boolean): string | undefined {
  if (!VARIABLE_WRITE_KINDS.has(node.kind)) return undefined;
  const source = literalOf(node, 'source');
  const mine = source === undefined || source === 'run' || (persistent && source === 'automation');
  return mine ? textOf(node, 'name') : undefined;
}

export function loopsAbove(index: ProgramIndex, entry: NodeEntry): readonly string[] {
  return entry.ancestors.filter((key) => {
    const owner = index.byKey.get(key);
    return owner !== undefined && LOOP_KINDS.has(owner.node.kind);
  });
}

export function canonicalJson(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (typeof value === 'object' && value !== null) {
    const members = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([name, member]) => `${JSON.stringify(name)}:${canonicalJson(member)}`);
    return `{${members.join(',')}}`;
  }
  return JSON.stringify(value);
}
