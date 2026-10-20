import type { FlowNode, Scope, TriggerNode } from '@smarteverything/domain';
import type { ScopePath } from './paths';
import { formatScopePath } from './paths';
import type { Program, StoragePath, WalkedNode } from './walk';
import { childScopeRefs, rootScopes, walkProgram } from './walk';

export interface NodeEntry extends WalkedNode {
  readonly kind: 'node';
}

export interface TriggerEntry {
  readonly kind: 'trigger';
  readonly node: TriggerNode;
  readonly index: number;
  readonly storage: StoragePath;
}

export type Entry = NodeEntry | TriggerEntry;

export interface ProgramIndex {
  readonly program: Program;
  readonly nodes: readonly NodeEntry[];
  readonly byId: ReadonlyMap<string, Entry>;
  readonly byKey: ReadonlyMap<string, Entry>;
}

function triggerEntries(program: Program): readonly TriggerEntry[] {
  if (program.kind !== 'automation') return [];
  return program.triggers.map((node, index) => ({
    kind: 'trigger',
    node,
    index,
    storage: ['triggers', index],
  }));
}

export function indexProgram(program: Program): ProgramIndex {
  const nodes = walkProgram(program).map((walked): NodeEntry => ({ kind: 'node', ...walked }));
  const byId = new Map<string, Entry>();
  const byKey = new Map<string, Entry>();
  for (const entry of [...triggerEntries(program), ...nodes]) {
    if (!byId.has(entry.node.id)) byId.set(entry.node.id, entry);
    if (!byKey.has(entry.node.key)) byKey.set(entry.node.key, entry);
  }
  return { program, nodes, byId, byKey };
}

export function findById(index: ProgramIndex, id: string): Entry | undefined {
  return index.byId.get(id);
}

export function findByKey(index: ProgramIndex, key: string): Entry | undefined {
  return index.byKey.get(key);
}

export function enclosingContainers(index: ProgramIndex, key: string): readonly FlowNode[] {
  const entry = index.byKey.get(key);
  if (entry?.kind !== 'node') return [];
  return entry.ancestors.flatMap((ancestor) =>
    index.nodes
      .filter((candidate) => candidate.node.key === ancestor)
      .slice(0, 1)
      .map((candidate) => candidate.node),
  );
}

export function siblings(index: ProgramIndex, key: string): readonly FlowNode[] {
  const entry = index.byKey.get(key);
  if (entry?.kind !== 'node') return [];
  const here = formatScopePath(entry.scope);
  return index.nodes
    .filter((other) => formatScopePath(other.scope) === here)
    .map((other) => other.node);
}

export function resolveScope(index: ProgramIndex, path: ScopePath): Scope | undefined {
  if (path.t === 'root') {
    return rootScopes(index.program).find(
      (root) => root.path.t === 'root' && root.path.root === path.root,
    )?.scope;
  }
  const owner = index.byKey.get(path.key);
  if (owner?.kind !== 'node') return undefined;
  const wanted = formatScopePath(path);
  return childScopeRefs(owner.node, owner.storage).find(
    (child) => formatScopePath(child.path) === wanted,
  )?.scope;
}

export function execOrder(
  index: ProgramIndex,
  isExec: (kind: string) => boolean,
): readonly NodeEntry[] {
  return index.nodes.filter((entry) => isExec(entry.node.kind));
}
