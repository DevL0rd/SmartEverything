import type {
  FlowType,
  NodeCategoryId,
  NodeRegistry,
  OutputPortDecl,
  PortValue,
  Wire,
  WireScope,
} from '@smarteverything/domain';
import {
  EXPLICIT_CONVERSIONS,
  FLOW_SCOPE_OUTPUTS,
  conversionsOffered,
  isAssignable,
  nodeLabel,
  outputLabel,
  plainWire,
  typeDisplayName,
} from '@smarteverything/domain';
import { defaultScopeOutputs } from '@smarteverything/flow/check/visibility';
import type { Entry, NodeEntry, ProgramIndex } from '@smarteverything/flow/program/lookup';
import type { ChildPart, ScopePath } from '@smarteverything/flow/program/paths';
import { formatScopePath } from '@smarteverything/flow/program/paths';

export interface WireChoice {
  readonly ref: string;
  readonly root: string;
  readonly output: string;
  readonly label: string;
  readonly type: FlowType;
  readonly typeLabel: string;
  readonly hint: string | undefined;
}

export type GroupKind = 'trigger' | 'step' | 'scope' | 'variables' | 'inputs';

export interface WireGroup {
  readonly id: string;
  readonly kind: GroupKind;
  readonly root: string;
  readonly label: string;
  readonly icon: string | undefined;
  readonly category: NodeCategoryId | undefined;
  readonly choices: readonly WireChoice[];
}

export interface WireQuery {
  readonly index: ProgramIndex;
  readonly registry: NodeRegistry;
  readonly ownerKey: string;
  readonly expected: FlowType | undefined;
}

interface Enclosing {
  readonly entry: NodeEntry;
  readonly part: ChildPart;
}

export function wireRef(root: string, output: string): string {
  return `${root}.${output}`;
}

function hintFor(from: FlowType, to: FlowType): string | undefined {
  const [first] = conversionsOffered(from, to);
  return EXPLICIT_CONVERSIONS.find((conversion) => conversion.id === first)?.label;
}

function choiceOf(
  root: string,
  decl: { readonly name: string; readonly type: FlowType },
  expected: FlowType | undefined,
): WireChoice | undefined {
  const base = {
    ref: wireRef(root, decl.name),
    root,
    output: decl.name,
    label: outputLabel(decl.name),
    type: decl.type,
    typeLabel: typeDisplayName(decl.type),
  };
  if (expected === undefined || isAssignable(decl.type, expected)) {
    return { ...base, hint: undefined };
  }
  const hint = hintFor(decl.type, expected);
  return hint === undefined ? undefined : { ...base, hint };
}

function declsOf(entry: Entry, registry: NodeRegistry): readonly OutputPortDecl[] {
  const kind = registry.get(entry.node.kind);
  const declared = (kind?.outputs ?? []).map((decl): OutputPortDecl =>
    decl.optional === true ? { ...decl, type: { t: 'optional', of: decl.type } } : decl,
  );
  const { node } = entry;
  const structured = 'outputs' in node ? (node.outputs ?? []) : [];
  return [
    ...declared,
    ...structured.flatMap((output) =>
      output.type === undefined ? [] : [{ name: output.name, type: output.type, description: '' }],
    ),
  ];
}

function enclosingOf(index: ProgramIndex, scope: ScopePath): readonly Enclosing[] {
  const chain: Enclosing[] = [];
  let current = scope;
  while (current.t === 'child') {
    const found = index.byKey.get(current.key);
    if (found?.kind !== 'node') break;
    chain.push({ entry: found, part: current.part });
    current = found.scope;
  }
  return chain;
}

function isValueClass(registry: NodeRegistry, kindId: string): boolean {
  const kindClass = registry.get(kindId)?.class;
  return kindClass === 'pure' || kindClass === 'read';
}

function visibleBefore(query: WireQuery, owner: NodeEntry): readonly NodeEntry[] {
  const { index, registry } = query;
  const chain = enclosingOf(index, owner.scope);
  const lenient = isValueClass(registry, owner.node.kind);
  const levels = new Map<string, number>([
    [formatScopePath(owner.scope), lenient ? Infinity : owner.index],
    ...chain.map((outer): [string, number] => [
      formatScopePath(outer.entry.scope),
      outer.entry.index,
    ]),
  ]);
  const outerKeys = new Set(chain.map((outer) => outer.entry.node.key));
  return index.nodes.filter((candidate) => {
    const limit = levels.get(formatScopePath(candidate.scope));
    if (limit === undefined || candidate.node.key === owner.node.key) return false;
    if (outerKeys.has(candidate.node.key)) return false;
    return isValueClass(registry, candidate.node.kind) || candidate.index < limit;
  });
}

function stepGroup(entry: Entry, query: WireQuery, kind: GroupKind): WireGroup | undefined {
  const choices = declsOf(entry, query.registry).flatMap((decl) => {
    const choice = choiceOf(entry.node.key, decl, query.expected);
    return choice === undefined ? [] : [choice];
  });
  if (choices.length === 0) return undefined;
  const found = query.registry.get(entry.node.kind);
  return {
    id: entry.node.id,
    kind,
    root: entry.node.key,
    label: nodeLabel(entry.node, (id) => query.registry.get(id)),
    icon: found?.icon,
    category: found?.category,
    choices,
  };
}

function scopeGroup(outer: Enclosing, query: WireQuery): WireGroup | undefined {
  const names = defaultScopeOutputs(outer.entry.node.kind, outer.part);
  const decls = (FLOW_SCOPE_OUTPUTS[outer.entry.node.kind] ?? []).filter((decl) =>
    names.includes(decl.name),
  );
  const choices = decls.flatMap((decl) => {
    const choice = choiceOf(outer.entry.node.key, decl, query.expected);
    return choice === undefined ? [] : [choice];
  });
  if (choices.length === 0) return undefined;
  return {
    id: `scope:${outer.entry.node.id}`,
    kind: 'scope',
    root: outer.entry.node.key,
    label: nodeLabel(outer.entry.node, (id) => query.registry.get(id)),
    icon: query.registry.get(outer.entry.node.kind)?.icon,
    category: query.registry.get(outer.entry.node.kind)?.category,
    choices,
  };
}

function programGroups(query: WireQuery): readonly WireGroup[] {
  const { program } = query.index;
  const make = (
    kind: 'variables' | 'inputs',
    label: string,
    root: string,
    decls: readonly { readonly name: string; readonly type: FlowType }[],
  ): readonly WireGroup[] => {
    const choices = decls.flatMap((decl) => {
      const choice = choiceOf(root, decl, query.expected);
      return choice === undefined ? [] : [choice];
    });
    return choices.length === 0
      ? []
      : [{ id: root, kind, root, label, icon: undefined, category: undefined, choices }];
  };
  return [
    ...make('variables', 'Variables', 'vars', program.variables),
    ...make('inputs', 'Inputs', 'inputs', program.inputs),
  ];
}

function triggerGroups(query: WireQuery): readonly WireGroup[] {
  const { program } = query.index;
  if (program.kind !== 'automation') return [];
  return program.triggers.flatMap((trigger, position) => {
    const entry: Entry = {
      kind: 'trigger',
      node: trigger,
      index: position,
      storage: ['triggers', position],
    };
    const group = stepGroup(entry, query, 'trigger');
    return group === undefined ? [] : [group];
  });
}

export function wireGroups(query: WireQuery): readonly WireGroup[] {
  const owner = query.index.byKey.get(query.ownerKey);
  if (owner?.kind !== 'node') return [];
  const scopes = enclosingOf(query.index, owner.scope).flatMap((outer) => {
    const group = scopeGroup(outer, query);
    return group === undefined ? [] : [group];
  });
  const steps = visibleBefore(query, owner).flatMap((entry) => {
    const group = stepGroup(entry, query, 'step');
    return group === undefined ? [] : [group];
  });
  return [...scopes, ...triggerGroups(query), ...steps, ...programGroups(query)];
}

export function currentWire(value: PortValue | undefined): Wire | undefined {
  return value !== undefined && 'wire' in value ? value.wire : undefined;
}

export function wireLabel(value: PortValue | undefined, scope: WireScope): string | undefined {
  const wire = currentWire(value);
  return wire === undefined ? undefined : plainWire(wire, scope);
}

export function wireValue(choice: WireChoice): PortValue {
  return { wire: { from: choice.root, port: choice.output } };
}

export function filterGroups(groups: readonly WireGroup[], query: string): readonly WireGroup[] {
  const needle = query.trim().toLowerCase();
  if (needle === '') return groups;
  return groups.flatMap((group) => {
    if (group.label.toLowerCase().includes(needle)) return [group];
    const choices = group.choices.filter((choice) => choice.label.toLowerCase().includes(needle));
    return choices.length === 0 ? [] : [{ ...group, choices }];
  });
}
