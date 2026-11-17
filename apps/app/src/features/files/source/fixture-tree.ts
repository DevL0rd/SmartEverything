import type { DriveZipEntry } from '@smarteverything/domain';
import { NO_MARKS, kindOfFile } from './node';
import { refusedOf, type FileOp, type OpFailure, type OpResult } from './ops';
import type { EntryNote, FileLocation, FileMarks, FileNode, FileNodeKind } from './types';

export interface FixtureOrigin {
  readonly text: string | null;
  readonly zip: readonly DriveZipEntry[] | null;
}

export type FixtureNode = FileNode<FixtureOrigin>;

export interface FixtureEntry {
  readonly key: string;
  readonly parentKey: string;
  readonly name: string;
  readonly kind?: FileNodeKind;
  readonly mime?: string | null;
  readonly size?: number;
  readonly modifiedAt?: string;
  readonly hidden?: boolean;
  readonly byProfileId?: string | null;
  readonly marks?: Partial<FileMarks>;
  readonly writable?: boolean;
  readonly exportable?: boolean;
  readonly entry?: EntryNote;
  readonly text?: string | null;
  readonly zip?: readonly DriveZipEntry[] | null;
}

export interface Trashed {
  readonly node: FixtureNode;
  readonly within: readonly FixtureNode[];
}

export interface FixtureTree {
  readonly nodes: ReadonlyMap<string, FixtureNode>;
  readonly trashed: ReadonlyMap<string, Trashed>;
  readonly sequence: number;
}

export const FIXTURE_TIME = '2026-11-14T10:00:00.000Z';

function originOf(entry: FixtureEntry): FixtureOrigin {
  return { text: entry.text ?? null, zip: entry.zip ?? null };
}

function sizeOf(entry: FixtureEntry, kind: FileNodeKind): number | null {
  return kind === 'folder' ? null : (entry.size ?? 0);
}

export function nodeOfEntry(entry: FixtureEntry): FixtureNode {
  const mime = entry.mime ?? null;
  const kind = entry.kind ?? kindOfFile(mime, entry.name);
  return {
    key: entry.key,
    parentKey: entry.parentKey,
    name: entry.name,
    kind,
    mime,
    size: sizeOf(entry, kind),
    childCount: null,
    files: null,
    modifiedAt: entry.modifiedAt ?? FIXTURE_TIME,
    hidden: entry.hidden ?? entry.name.startsWith('.'),
    byProfileId: entry.byProfileId ?? null,
    marks: { ...NO_MARKS, ...entry.marks },
    exportable: entry.exportable ?? true,
    writable: entry.writable ?? true,
    deletable: entry.writable ?? true,
    entry: entry.entry ?? null,
    origin: originOf(entry),
  };
}

export function treeOf(
  entries: readonly FixtureEntry[],
  trashed: readonly FixtureEntry[] = [],
): FixtureTree {
  return {
    nodes: new Map(entries.map((entry) => [entry.key, nodeOfEntry(entry)] as const)),
    trashed: new Map(
      trashed.map((entry) => {
        const node = nodeOfEntry(entry);
        return [entry.key, { node, within: [node] }] as const;
      }),
    ),
    sequence: 0,
  };
}

export function folderKeyOf(location: FileLocation): string {
  return location.folder ?? location.place;
}

export function childrenOf(tree: FixtureTree, folderKey: string): readonly FixtureNode[] {
  return [...tree.nodes.values()]
    .filter((node) => node.parentKey === folderKey)
    .map((node) =>
      node.kind === 'folder' ? { ...node, childCount: countChildren(tree, node.key) } : node,
    );
}

function countChildren(tree: FixtureTree, key: string): number {
  let total = 0;
  for (const node of tree.nodes.values()) if (node.parentKey === key) total += 1;
  return total;
}

export function ancestorsOf(tree: FixtureTree, key: string): readonly FixtureNode[] {
  const out: FixtureNode[] = [];
  for (let at = tree.nodes.get(key); at !== undefined; at = tree.nodes.get(at.parentKey ?? '')) {
    out.unshift(at);
  }
  return out;
}

export function descendantsOf(tree: FixtureTree, key: string): readonly FixtureNode[] {
  const direct = [...tree.nodes.values()].filter((node) => node.parentKey === key);
  return direct.flatMap((node) => [node, ...descendantsOf(tree, node.key)]);
}

export interface Applied {
  readonly tree: FixtureTree;
  readonly result: OpResult;
}

type Step = (tree: FixtureTree, node: FixtureNode) => FixtureTree | string;

function withNodes(
  tree: FixtureTree,
  change: (nodes: Map<string, FixtureNode>) => void,
): FixtureTree {
  const nodes = new Map(tree.nodes);
  change(nodes);
  return { ...tree, nodes };
}

function each(tree: FixtureTree, nodes: readonly FixtureNode[], step: Step): Applied {
  let current = tree;
  const done: string[] = [];
  const failed: OpFailure[] = [];
  for (const node of nodes) {
    const next = step(current, node);
    if (typeof next === 'string') {
      failed.push({ key: node.key, reason: next });
    } else {
      current = next;
      done.push(node.key);
    }
  }
  return { tree: current, result: { done, failed, undo: null } };
}

function nameTaken(
  tree: FixtureTree,
  folderKey: string,
  name: string,
  except: string | null,
): boolean {
  return childrenOf(tree, folderKey).some((node) => node.name === name && node.key !== except);
}

function moveStep(to: string): Step {
  return (tree, node) => {
    if (node.key === to || ancestorsOf(tree, to).some((step) => step.key === node.key)) {
      return 'A folder can’t be moved into itself.';
    }
    if (nameTaken(tree, to, node.name, node.key)) return 'An item with this name is already there.';
    return withNodes(tree, (nodes) => nodes.set(node.key, { ...node, parentKey: to }));
  };
}

function copyStep(to: string): Step {
  return (tree, node) => {
    if (nameTaken(tree, to, node.name, null)) return 'An item with this name is already there.';
    const sequence = tree.sequence + 1;
    const key = `${node.key}~copy${String(sequence)}`;
    const copied = { ...tree, sequence };
    return withNodes(copied, (nodes) => nodes.set(key, { ...node, key, parentKey: to }));
  };
}

const trashStep: Step = (tree, node) => {
  const gone = [node, ...descendantsOf(tree, node.key)];
  const trashed = new Map(tree.trashed);
  trashed.set(node.key, { node, within: gone });
  return {
    ...withNodes(tree, (nodes) => {
      for (const item of gone) nodes.delete(item.key);
    }),
    trashed,
  };
};

const restoreStep: Step = (tree, node) => {
  const entry = tree.trashed.get(node.key);
  if (entry === undefined) return 'This item is not in the Trash.';
  const trashed = new Map(tree.trashed);
  trashed.delete(node.key);
  const back = withNodes(tree, (nodes) => {
    for (const item of entry.within) nodes.set(item.key, item);
  });
  return { ...back, trashed };
};

const deleteStep: Step = (tree, node) => {
  if (!tree.trashed.has(node.key)) return 'This item is not in the Trash.';
  const trashed = new Map(tree.trashed);
  trashed.delete(node.key);
  return { ...tree, trashed };
};

function starStep(starred: boolean): Step {
  return (tree, node) =>
    withNodes(tree, (nodes) => nodes.set(node.key, { ...node, marks: { ...node.marks, starred } }));
}

function renamed(tree: FixtureTree, node: FixtureNode, name: string): Applied {
  if (nameTaken(tree, node.parentKey ?? '', name, node.key)) {
    return {
      tree,
      result: refusedOf({ kind: 'rename', node, name }, 'An item with this name is already there.'),
    };
  }
  return each(tree, [node], (current) =>
    withNodes(current, (nodes) => nodes.set(node.key, { ...node, name })),
  );
}

function newFolder(tree: FixtureTree, location: FileLocation, name: string): Applied {
  const parentKey = folderKeyOf(location);
  if (nameTaken(tree, parentKey, name, null)) {
    return {
      tree,
      result: {
        done: [],
        failed: [{ key: name, reason: 'An item with this name is already there.' }],
        undo: null,
      },
    };
  }
  const sequence = tree.sequence + 1;
  const key = `${parentKey}/${name}~${String(sequence)}`;
  const node = nodeOfEntry({ key, parentKey, name, kind: 'folder' });
  return {
    tree: withNodes({ ...tree, sequence }, (nodes) => nodes.set(key, node)),
    result: { done: [key], failed: [], undo: null },
  };
}

export function applyOp(tree: FixtureTree, op: FileOp<FixtureOrigin>): Applied {
  switch (op.kind) {
    case 'new_folder':
      return newFolder(tree, op.in, op.name);
    case 'rename':
      return renamed(tree, op.node, op.name);
    case 'move':
      return each(tree, op.nodes, moveStep(folderKeyOf(op.to)));
    case 'copy':
      return each(tree, op.nodes, copyStep(folderKeyOf(op.to)));
    case 'trash':
      return each(tree, op.nodes, trashStep);
    case 'restore':
      return each(tree, op.nodes, restoreStep);
    case 'delete_now':
      return each(tree, op.nodes, deleteStep);
    case 'star':
    case 'unstar':
      return each(tree, op.nodes, starStep(op.kind === 'star'));
  }
}
