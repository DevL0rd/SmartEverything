import type { GraphNode } from '../automation-v3/graph';
import type { SwitchMatch } from '../automation-v3/node';
import type { JsonValue } from '../values';
import type { NodeKind, OutputPortDecl } from './define';
import { ERROR_EXIT_OUTPUTS, ERROR_EXIT_PORT } from './error-port';
import type { NodeKindLookup } from './kind-lookup';

export { kindLookupFrom, STATIC_KIND_LOOKUP, type NodeKindLookup } from './kind-lookup';

export type ExecRole = 'next' | 'branch' | 'lane';

export type ExecClass =
  'start' | 'failure' | 'step' | 'decision' | 'owner' | 'fork' | 'join' | 'terminal' | 'value';

export interface ExecOutput {
  readonly port: string;
  readonly handle: string;
  readonly role: ExecRole;
  readonly label: string;
  readonly target?: string;
  readonly carries?: readonly OutputPortDecl[];
}

export interface ExecPorts {
  readonly input: boolean;
  readonly outputs: readonly ExecOutput[];
}

const NEXT = 'next';
const TIMED_OUT = 'timedOut';

const STRUCTURAL_CLASSES: ReadonlyMap<string, ExecClass> = new Map([
  ['flow.start', 'start'],
  ['flow.on_failure', 'failure'],
  ['flow.join', 'join'],
]);

const TERMINAL_IDS: ReadonlySet<string> = new Set([
  'flow.stop',
  'flow.return',
  'flow.fail',
  'flow.break',
  'flow.continue',
]);

const DECISION_IDS: ReadonlySet<string> = new Set(['flow.if', 'flow.switch', 'flow.guard']);

const LOOP_IDS: ReadonlySet<string> = new Set([
  'flow.for_each',
  'flow.repeat',
  'flow.for_range',
  'flow.while',
  'flow.do_until',
  'flow.forever',
]);

const BODY_LABELS: Readonly<Record<string, string>> = {
  'flow.for_each': 'Each item',
  'device.set_temporarily': 'While',
};

function humanise(name: string): string {
  const words = name.replace(/([A-Z])/g, ' $1').toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

function laneScopesOf(kind: NodeKind): readonly string[] {
  if (kind.scopes === undefined) return [];
  return [...kind.scopes.required, ...kind.scopes.optional].filter(
    (name) => !kind.exits.includes(name),
  );
}

function valueClassOf(kind: NodeKind): ExecClass {
  if (kind.class === 'read') return kind.capture === 'at-step' ? 'step' : 'value';
  return 'value';
}

function controlClassOf(kind: NodeKind): ExecClass {
  if (TERMINAL_IDS.has(kind.id)) return 'terminal';
  if (DECISION_IDS.has(kind.id)) return 'decision';
  if (kind.id === 'flow.try') return 'owner';
  if (kind.scopes?.minimum !== undefined) return 'fork';
  if (laneScopesOf(kind).length > 0) return 'owner';
  return kind.exits.slice(1).some((exit) => exit !== TIMED_OUT) ? 'decision' : 'step';
}

export function execClassOf(kindId: string, kinds: NodeKindLookup): ExecClass {
  const structural = STRUCTURAL_CLASSES.get(kindId);
  if (structural !== undefined) return structural;
  const kind = kinds.get(kindId);
  if (kind === undefined) return 'value';
  if (kind.class === 'pure' || kind.class === 'read' || kind.class === 'trigger') {
    return valueClassOf(kind);
  }
  return controlClassOf(kind);
}

export function isExecNode(kindId: string, kinds: NodeKindLookup): boolean {
  return execClassOf(kindId, kinds) !== 'value';
}

export type FallibleKind = Pick<NodeKind, 'class' | 'inputs' | 'fallible'>;

function derivedFallible(kind: FallibleKind): boolean {
  if (kind.class === 'effect') return true;
  return kind.class === 'control' && kind.inputs.some((port) => port.name === 'timeout');
}

export function fallibleOf(kind: FallibleKind | string, kinds: NodeKindLookup): boolean {
  const found = typeof kind === 'string' ? kinds.get(kind) : kind;
  if (found === undefined) return false;
  return found.fallible ?? derivedFallible(found);
}

export function canRouteOnError(kindId: string, kinds: NodeKindLookup): boolean {
  return execClassOf(kindId, kinds) === 'step' && fallibleOf(kindId, kinds);
}

export function isErrorExitWired(node: GraphNode | undefined): boolean {
  return node?.to?.[ERROR_EXIT_PORT] !== undefined;
}

function handleOf(port: string): string {
  return `x:${port}`;
}

function output(
  port: string,
  role: ExecRole,
  label: string,
  target: string | undefined,
): ExecOutput {
  const base = { port, handle: handleOf(port), role, label };
  return target === undefined ? base : { ...base, target };
}

function named(
  node: GraphNode | undefined,
  port: string,
  role: ExecRole,
  label: string,
): ExecOutput {
  return output(port, role, label, node?.to?.[port]);
}

function thenOutput(node: GraphNode | undefined, label = 'Then'): ExecOutput {
  return named(node, NEXT, 'next', label);
}

function routedOutputs(node: GraphNode | undefined): readonly ExecOutput[] {
  const shown = node?.policy?.onError === 'route' || isErrorExitWired(node);
  if (!shown) return [];
  return [{ ...named(node, ERROR_EXIT_PORT, 'lane', 'If it fails'), carries: ERROR_EXIT_OUTPUTS }];
}

function exitOutputs(kind: NodeKind, node: GraphNode | undefined): readonly ExecOutput[] {
  const extras = kind.exits.slice(1).flatMap((exit): readonly ExecOutput[] => {
    if (exit !== TIMED_OUT) return [named(node, exit, 'branch', humanise(exit))];
    return node?.ports?.['timeout'] === undefined ? [] : [named(node, exit, 'lane', 'Timed out')];
  });
  return [thenOutput(node), ...extras];
}

function stepOutputs(kind: NodeKind, node: GraphNode | undefined): readonly ExecOutput[] {
  return [...exitOutputs(kind, node), ...routedOutputs(node)];
}

function rowLabel(index: number): string {
  return index === 0 ? 'If' : 'Else if';
}

function scalarText(value: JsonValue): string | undefined {
  return typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    ? String(value)
    : undefined;
}

function caseLabel(match: SwitchMatch, index: number): string {
  if ('eq' in match) {
    const text = scalarText(match.eq);
    return text === undefined ? `Case ${String(index + 1)}` : `Is ${text}`;
  }
  if ('in' in match) return `Is one of ${String(match.in.length)}`;
  if ('range' in match) return 'In a range';
  return 'When true';
}

function ifOutputs(node: GraphNode | undefined): readonly ExecOutput[] {
  const rows = (node?.branches ?? []).map((row, index) =>
    output(`row:${row.id}`, 'branch', row.name ?? rowLabel(index), row.to),
  );
  return [...rows, named(node, 'else', 'branch', 'Otherwise')];
}

function switchOutputs(node: GraphNode | undefined): readonly ExecOutput[] {
  const rows = (node?.cases ?? []).map((row, index) =>
    output(`case:${row.id}`, 'branch', row.name ?? caseLabel(row.match, index), row.to),
  );
  return [...rows, named(node, 'default', 'branch', 'Default')];
}

function guardOutputs(node: GraphNode | undefined): readonly ExecOutput[] {
  return [thenOutput(node), named(node, 'otherwise', 'branch', 'Otherwise')];
}

function catchLabel(classes: readonly string[] | undefined): string {
  return classes === undefined ? 'If it fails' : `On ${classes.join(' or ')}`;
}

function tryOutputs(node: GraphNode | undefined): readonly ExecOutput[] {
  const catches = (node?.catches ?? []).map((row) =>
    output(`catch:${row.id}`, 'lane', catchLabel(row.classes), row.to),
  );
  return [
    named(node, 'try', 'lane', 'Try'),
    ...catches,
    named(node, 'finally', 'lane', 'Finally'),
    thenOutput(node),
  ];
}

function forkOutputs(node: GraphNode | undefined): readonly ExecOutput[] {
  return (node?.paths ?? []).map((path) => output(`path:${path.name}`, 'lane', path.name, path.to));
}

function ownerOutputs(kind: NodeKind, node: GraphNode | undefined): readonly ExecOutput[] {
  const body = BODY_LABELS[kind.id] ?? 'Each pass';
  const lanes = laneScopesOf(kind).map((name) =>
    named(node, name, 'lane', name === 'body' ? body : humanise(name)),
  );
  return [...lanes, thenOutput(node, LOOP_IDS.has(kind.id) ? 'When done' : 'Then')];
}

function decisionOutputs(kind: NodeKind, node: GraphNode | undefined): readonly ExecOutput[] {
  if (kind.id === 'flow.if') return ifOutputs(node);
  if (kind.id === 'flow.switch') return switchOutputs(node);
  if (kind.id === 'flow.guard') return guardOutputs(node);
  return exitOutputs(kind, node);
}

function ownerClassOutputs(kind: NodeKind, node: GraphNode | undefined): readonly ExecOutput[] {
  return kind.id === 'flow.try' ? tryOutputs(node) : ownerOutputs(kind, node);
}

type OutputsOfClass = (kind: NodeKind, node: GraphNode | undefined) => readonly ExecOutput[];

const CLASS_OUTPUTS: Readonly<Record<ExecClass, OutputsOfClass>> = {
  start: (_kind, node) => [thenOutput(node)],
  failure: (_kind, node) => [thenOutput(node)],
  join: (_kind, node) => [thenOutput(node)],
  step: stepOutputs,
  decision: decisionOutputs,
  owner: ownerClassOutputs,
  fork: (_kind, node) => forkOutputs(node),
  terminal: () => [],
  value: () => [],
};

function outputsOf(
  kindId: string,
  node: GraphNode | undefined,
  kinds: NodeKindLookup,
): readonly ExecOutput[] {
  const kind = kinds.get(kindId);
  return kind === undefined ? [] : CLASS_OUTPUTS[execClassOf(kindId, kinds)](kind, node);
}

export function execPortsOf(
  kindId: string,
  node: GraphNode | undefined,
  kinds: NodeKindLookup,
): ExecPorts {
  const execClass = execClassOf(kindId, kinds);
  const hasInput = !['start', 'failure', 'value'].includes(execClass);
  return { input: hasInput, outputs: outputsOf(kindId, node, kinds) };
}
