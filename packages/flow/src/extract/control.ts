import type { FlowNode } from '@smarteverything/domain';
import { STATEFUL_KIND_IDS } from '@smarteverything/domain';
import type { NodeEntry, ProgramIndex } from '../program/lookup';
import { formatScopePath } from '../program/paths';
import type { Program } from '../program/walk';
import type { KindLookup, Region } from './region';
import { knownKind } from './region';
import { refuse } from './result';

export const DEFAULT_EXIT = 'done';

const LOOP_KINDS: ReadonlySet<string> = new Set([
  'flow.for_each',
  'flow.repeat',
  'flow.for_range',
  'flow.while',
  'flow.do_until',
  'flow.forever',
]);

export interface ControlFacts {
  readonly exits: readonly string[];
  readonly early: boolean;
}

interface Scan {
  readonly index: ProgramIndex;
  readonly region: Region;
  readonly program: Program;
}

function literalText(node: FlowNode, port: string): string | undefined {
  const value = node.ports?.[port];
  return value !== undefined && 'lit' in value && typeof value.lit === 'string'
    ? value.lit
    : undefined;
}

function checkLoop(entry: NodeEntry, scan: Scan): void {
  const { node } = entry;
  const target = node.ports?.['target'];
  if (target !== undefined && literalText(node, 'target') === undefined) {
    refuse('dynamic', `${node.key} names its loop with an expression`);
  }
  const named = literalText(node, 'target');
  const loops = new Set(
    scan.index.nodes
      .filter((other) => LOOP_KINDS.has(other.node.kind))
      .map((other) => other.node.key),
  );
  const key =
    named === undefined || named === ''
      ? entry.ancestors.findLast((ancestor) => loops.has(ancestor))
      : named;
  if (key === undefined || !entry.ancestors.includes(key) || !scan.region.keys.has(key)) {
    refuse('control', `${node.key} leaves a loop that is outside the selection`);
  }
}

function returnExit(node: FlowNode, scan: Scan): string {
  const others = Object.keys(node.ports ?? {}).filter((name) => name !== 'exit');
  if (others.length > 0) {
    refuse('control', `${node.key} returns values of the enclosing program and cannot move`);
  }
  if (!scan.region.atEnd || !scan.region.root) {
    refuse('control', `${node.key} ends the whole program, so the selection must end the body`);
  }
  return scan.program.kind === 'function'
    ? (literalText(node, 'exit') ?? DEFAULT_EXIT)
    : DEFAULT_EXIT;
}

function checkGuard(entry: NodeEntry, scan: Scan): boolean {
  const topLevel = formatScopePath(entry.scope) === formatScopePath(scan.region.scope);
  if (topLevel && !scan.region.atEnd) {
    refuse('control', `${entry.node.key} ends the scope, so the selection must end the scope`);
  }
  return topLevel;
}

function checkEntry(entry: NodeEntry, scan: Scan, kinds: KindLookup): ControlFacts {
  const { node } = entry;
  if (knownKind(node, kinds).class === 'trigger') refuse('trigger', `${node.key} is a trigger`);
  if (STATEFUL_KIND_IDS.has(node.kind)) {
    refuse('stateful', `${node.key} keeps memory and cannot sit inside a Custom Node`);
  }
  if (node.kind === 'flow.break' || node.kind === 'flow.continue') checkLoop(entry, scan);
  if (node.kind === 'flow.return') return { exits: [returnExit(node, scan)], early: true };
  return { exits: [], early: node.kind === 'flow.guard' && checkGuard(entry, scan) };
}

export function controlFacts(
  entries: readonly NodeEntry[],
  scan: Scan,
  kinds: KindLookup,
): ControlFacts {
  const facts = entries.map((entry) => checkEntry(entry, scan, kinds));
  const extra = facts.flatMap((fact) => fact.exits).filter((exit) => exit !== DEFAULT_EXIT);
  return {
    exits: [DEFAULT_EXIT, ...new Set(extra)],
    early: facts.some((fact) => fact.early),
  };
}
