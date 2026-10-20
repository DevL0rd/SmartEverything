import type { NavNodeView } from './nav-model';

export interface Foldable {
  readonly key: string;
  readonly folder: boolean;
  readonly parent: string | null;
  readonly fixed: boolean;
}

export type FoldKind = 'create' | 'join' | 'refuse';

export function foldKind(dragged: Foldable, target: Foldable): FoldKind {
  if (dragged.key === target.key || dragged.folder || dragged.fixed) return 'refuse';
  if (target.folder) return 'join';
  return target.parent !== null || target.fixed ? 'refuse' : 'create';
}

export function isFixedNode(node: NavNodeView): boolean {
  return node.kind === 'section' && node.tab === 'assistant';
}

export function foldableOf(node: NavNodeView, parent: string | null): Foldable {
  return { key: node.key, folder: node.kind === 'folder', parent, fixed: isFixedNode(node) };
}
