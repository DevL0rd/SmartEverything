import type { FlowNode } from '@smarteverything/domain';
import { entryReferences, programLevelReferences } from '../check/references';
import type { CheckKind } from '../check/shapes';
import { entriesOf } from '../check/shapes';
import type { NodeEntry, ProgramIndex } from '../program/lookup';
import { siblings } from '../program/lookup';
import type { ScopePath } from '../program/paths';
import { formatScopePath } from '../program/paths';
import { refuse } from './result';

export type KindLookup = (id: string) => CheckKind | undefined;

export interface Region {
  readonly scope: ScopePath;
  readonly nodes: readonly FlowNode[];
  readonly keys: ReadonlySet<string>;
  readonly position: number;
  readonly atEnd: boolean;
  readonly root: boolean;
}

const PROGRAM_READER = '#program';

export function subtreeKeys(node: FlowNode): readonly string[] {
  const inner = [
    ...Object.values(node.scopes ?? {}),
    ...(node.branches ?? []).map((row) => row.scope),
    ...(node.cases ?? []).map((row) => row.scope),
    ...(node.catches ?? []).map((row) => row.scope),
  ].flatMap((scope) => scope.nodes.flatMap(subtreeKeys));
  return [node.key, ...inner];
}

export function knownKind(node: FlowNode, kinds: KindLookup): CheckKind {
  const kind = kinds(node.kind);
  if (kind === undefined) refuse('unknown_kind', `${node.key} is of the unknown kind ${node.kind}`);
  return kind;
}

export function isExec(node: FlowNode, kinds: KindLookup): boolean {
  const { class: nodeClass } = knownKind(node, kinds);
  return nodeClass !== 'pure' && nodeClass !== 'read';
}

function selectedEntries(index: ProgramIndex, selection: readonly string[]): readonly NodeEntry[] {
  if (selection.length === 0) refuse('empty', 'select at least one node');
  return [...new Set(selection)].map((key) => {
    const entry = index.byKey.get(key);
    if (entry === undefined) refuse('unknown_key', `there is no node with the key ${key}`);
    if (entry.kind === 'trigger') {
      refuse('trigger', `${key} is a trigger and triggers stay in the automation`);
    }
    return entry;
  });
}

function withoutNested(entries: readonly NodeEntry[]): readonly NodeEntry[] {
  const keys = new Set(entries.map((entry) => entry.node.key));
  return entries.filter((entry) => !entry.ancestors.some((ancestor) => keys.has(ancestor)));
}

function inOneScope(entries: readonly NodeEntry[]): boolean {
  return new Set(entries.map((entry) => formatScopePath(entry.scope))).size === 1;
}

function deepest(entries: readonly NodeEntry[]): NodeEntry {
  return entries.reduce((best, entry) =>
    entry.ancestors.length > best.ancestors.length ? entry : best,
  );
}

function container(index: ProgramIndex, entry: NodeEntry): NodeEntry {
  const key = entry.ancestors.at(-1);
  const parent = key === undefined ? undefined : index.byKey.get(key);
  if (parent?.kind !== 'node') {
    refuse('scattered', 'the selection spans the body and the failure handler');
  }
  return parent;
}

function lifted(
  index: ProgramIndex,
  entries: readonly NodeEntry[],
): { readonly entries: readonly NodeEntry[]; readonly moved: boolean } {
  let current = entries;
  let moved = false;
  while (!inOneScope(current)) {
    const lowest = deepest(current);
    const parent = container(index, lowest);
    current = withoutNested([...current.filter((entry) => entry !== lowest), parent]);
    moved = true;
  }
  return { entries: current, moved };
}

function rangeKeys(
  nodes: readonly FlowNode[],
  entries: readonly NodeEntry[],
  kinds: KindLookup,
): readonly string[] {
  const positions = entries.map((entry) => entry.index);
  const range = nodes.slice(Math.min(...positions), Math.max(...positions) + 1);
  return range.filter((node) => isExec(node, kinds)).map((node) => node.key);
}

function checkContiguous(
  nodes: readonly FlowNode[],
  chosen: readonly NodeEntry[],
  kinds: KindLookup,
  moved: boolean,
): void {
  const suggestion = rangeKeys(nodes, chosen, kinds);
  if (moved) {
    refuse('scattered', 'the selection reaches into different scopes', suggestion);
  }
  const picked = new Set(chosen.map((entry) => entry.node.key));
  const gap = suggestion.some((key) => !picked.has(key));
  const wholeRange = chosen.some((entry) => isExec(entry.node, kinds)) && gap;
  if (wholeRange) refuse('scattered', 'the selected steps are not next to each other', suggestion);
}

function readersByKey(index: ProgramIndex): ReadonlyMap<string, ReadonlySet<string>> {
  const readers = new Map<string, Set<string>>();
  const add = (key: string, owner: string): void => {
    readers.set(key, (readers.get(key) ?? new Set<string>()).add(owner));
  };
  for (const entry of entriesOf(index)) {
    for (const reference of entryReferences(entry)) add(reference.from, entry.node.key);
  }
  for (const reference of programLevelReferences(index.program))
    add(reference.from, PROGRAM_READER);
  return readers;
}

function covered(nodes: readonly FlowNode[], members: ReadonlySet<string>): ReadonlySet<string> {
  return new Set(nodes.filter((node) => members.has(node.key)).flatMap(subtreeKeys));
}

function pulledIn(
  index: ProgramIndex,
  nodes: readonly FlowNode[],
  chosen: readonly NodeEntry[],
  kinds: KindLookup,
): ReadonlySet<string> {
  const readers = readersByKey(index);
  const members = new Set(chosen.map((entry) => entry.node.key));
  const candidates = nodes.filter((node) => !isExec(node, kinds));
  for (;;) {
    const inside = covered(nodes, members);
    const next = candidates.filter((node) => {
      const owners = readers.get(node.key) ?? new Set<string>();
      return (
        !members.has(node.key) && owners.size > 0 && [...owners].every((owner) => inside.has(owner))
      );
    });
    if (next.length === 0) return members;
    for (const node of next) members.add(node.key);
  }
}

export function resolveRegion(
  index: ProgramIndex,
  selection: readonly string[],
  kinds: KindLookup,
): Region {
  const top = withoutNested(selectedEntries(index, selection));
  const { entries: chosen, moved } = lifted(index, top);
  const first = chosen.reduce((one) => one);
  const nodes = siblings(index, first.node.key);
  checkContiguous(nodes, chosen, kinds, moved);
  const members = pulledIn(index, nodes, chosen, kinds);
  const inside = nodes.filter((node) => members.has(node.key));
  const execPositions = nodes.flatMap((node, position) =>
    members.has(node.key) && isExec(node, kinds) ? [position] : [],
  );
  const lastExec = Math.max(-1, ...execPositions);
  return {
    scope: first.scope,
    nodes: inside,
    keys: covered(nodes, members),
    position: execPositions[0] ?? nodes.findIndex((node) => members.has(node.key)),
    atEnd:
      execPositions.length > 0 &&
      !nodes.some((node, position) => position > lastExec && isExec(node, kinds)),
    root: first.scope.t === 'root',
  };
}
