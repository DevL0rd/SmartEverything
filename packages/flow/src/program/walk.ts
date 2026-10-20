import type { AutomationV3, FlowNode, FunctionV3, Scope } from '@smarteverything/domain';
import type { ChildPart, ScopePath } from './paths';
import { BODY_PATH, ON_FAILURE_PATH, childPath } from './paths';

export type StoragePath = readonly (string | number)[];

export type Program = AutomationV3 | FunctionV3;

export interface ScopeRef {
  readonly path: ScopePath;
  readonly scope: Scope;
  readonly storage: StoragePath;
}

export interface WalkedNode {
  readonly node: FlowNode;
  readonly scope: ScopePath;
  readonly index: number;
  readonly ancestors: readonly string[];
  readonly storage: StoragePath;
}

export function rootScopes(program: Program): readonly ScopeRef[] {
  const roots: ScopeRef[] = [{ path: BODY_PATH, scope: program.body, storage: ['body'] }];
  if ('onFailure' in program && program.onFailure !== undefined) {
    roots.push({ path: ON_FAILURE_PATH, scope: program.onFailure, storage: ['onFailure'] });
  }
  return roots;
}

export function childScopeRefs(node: FlowNode, storage: StoragePath): readonly ScopeRef[] {
  const refs: ScopeRef[] = [];
  const add = (part: ChildPart, scope: Scope, tail: StoragePath): void => {
    refs.push({ path: childPath(node.key, part), scope, storage: [...storage, ...tail] });
  };
  for (const [name, scope] of Object.entries(node.scopes ?? {})) {
    add({ kind: 'scope', name }, scope, ['scopes', name]);
  }
  (node.branches ?? []).forEach((row, index) => {
    add({ kind: 'branch', id: row.id }, row.scope, ['branches', index, 'scope']);
  });
  (node.cases ?? []).forEach((row, index) => {
    add({ kind: 'case', id: row.id }, row.scope, ['cases', index, 'scope']);
  });
  (node.catches ?? []).forEach((row, index) => {
    add({ kind: 'catch', id: row.id }, row.scope, ['catches', index, 'scope']);
  });
  return refs;
}

function walkScope(ref: ScopeRef, ancestors: readonly string[], into: WalkedNode[]): void {
  ref.scope.nodes.forEach((node, index) => {
    const storage = [...ref.storage, 'nodes', index];
    into.push({ node, scope: ref.path, index, ancestors, storage });
    for (const child of childScopeRefs(node, storage)) {
      walkScope(child, [...ancestors, node.key], into);
    }
  });
}

export function walkProgram(program: Program): readonly WalkedNode[] {
  const walked: WalkedNode[] = [];
  for (const root of rootScopes(program)) walkScope(root, [], walked);
  return walked;
}
