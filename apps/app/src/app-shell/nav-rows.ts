import type { NavEntry, NavFolderView, NavNodeView } from './nav-model';

export type NavRow =
  | {
      readonly kind: 'entry';
      readonly key: string;
      readonly parent: string | null;
      readonly entry: NavEntry;
    }
  | {
      readonly kind: 'folder';
      readonly key: string;
      readonly parent: null;
      readonly folder: NavFolderView;
    };

function folderRows(folder: NavFolderView, expanded: boolean): readonly NavRow[] {
  const head: NavRow = { kind: 'folder', key: folder.key, parent: null, folder };
  if (!expanded) return [head];
  return [
    head,
    ...folder.items.map((entry): NavRow => ({
      kind: 'entry',
      key: entry.key,
      parent: folder.key,
      entry,
    })),
  ];
}

export function navRows(nodes: readonly NavNodeView[], expandAll: boolean): readonly NavRow[] {
  return nodes.flatMap((node): readonly NavRow[] =>
    node.kind === 'folder'
      ? folderRows(node, expandAll || node.open)
      : [{ kind: 'entry', key: node.key, parent: null, entry: node }],
  );
}

export function topRows(nodes: readonly NavNodeView[]): readonly NavRow[] {
  return navRows(nodes, false).filter((row) => row.parent === null);
}
