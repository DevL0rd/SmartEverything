import type {
  DriveItem,
  DriveOfflineState,
  DriveShortcut,
  DriveShortcutUnavailableReason,
  DriveTrashEntry,
} from '@smarteverything/domain';
import {
  NO_MARKS,
  kindOfFile,
  type EntryNote,
  type FileMarks,
  type FileNode,
  type FileNodeKind,
  type PlacementMark,
} from '../../files';
import {
  canWrite,
  driveOfRootId,
  isDriveOwner,
  type DriveAccess,
  type DriveRootPlace,
} from '../model/drive-access';
import { ENTRY_STAYS_LINE, entryLineOf, isEntryItem } from '../model/item-content';
import { accessOfItem, type DriveWorld } from './drive-places';

export type DriveOrigin =
  | { readonly kind: 'item'; readonly item: DriveItem; readonly access: DriveAccess }
  | {
      readonly kind: 'shortcut';
      readonly shortcut: DriveShortcut;
      readonly item: DriveItem | null;
      readonly access: DriveAccess;
      readonly target: DriveNode | null;
    }
  | { readonly kind: 'trash'; readonly entry: DriveTrashEntry };

export type DriveNode = FileNode<DriveOrigin>;

export interface DriveNodeContext extends DriveWorld {
  readonly offline: ReadonlyMap<string, DriveOfflineState>;
  readonly placements: ReadonlyMap<string, PlacementMark>;
}

export const SHORTCUT_UNAVAILABLE_TEXT: Readonly<Record<DriveShortcutUnavailableReason, string>> = {
  no_access: 'You no longer have access to the original',
  trashed: 'The original is in the trash',
};

export const SHORTCUT_KEY_PREFIX = 'shortcut:';

const STORED_KINDS: ReadonlySet<DriveItem['kind']> = new Set([
  'folder',
  'image',
  'video',
  'audio',
  'document',
  'other',
]);

export function isStoredItem(item: Pick<DriveItem, 'kind'>): boolean {
  return STORED_KINDS.has(item.kind);
}

export function kindOfItem(item: DriveItem): FileNodeKind {
  switch (item.kind) {
    case 'folder':
    case 'image':
    case 'video':
    case 'audio':
    case 'link':
    case 'special':
      return item.kind;
    case 'document':
      return kindOfFile(item.mime, item.name) === 'archive' ? 'archive' : 'document';
    case 'other':
      return kindOfFile(item.mime, item.name);
  }
}

function mimeOf(item: DriveItem): string | null {
  return item.kind === 'link' || item.kind === 'special' || item.kind === 'folder'
    ? null
    : item.mime;
}

function sizeOf(item: DriveItem): number | null {
  if (item.kind === 'folder') return item.totalBytes;
  return item.kind === 'link' || item.kind === 'special' ? null : item.bytes;
}

function marksOf(item: DriveItem, context: DriveNodeContext): FileMarks {
  return {
    ...NO_MARKS,
    starred: item.starred,
    shared: item.shared,
    locked: item.locked,
    comments: item.openComments,
    offline: context.offline.get(item.id) ?? null,
    placement: context.placements.get(item.id) ?? null,
    colour: item.kind === 'folder' ? item.colour : null,
    iconHint: item.kind === 'folder' && item.iconHint,
  };
}

function entryOf(item: DriveItem): EntryNote | null {
  return isEntryItem(item) ? { line: entryLineOf(item), stays: ENTRY_STAYS_LINE } : null;
}

export function driveNodeOf(item: DriveItem, context: DriveNodeContext): DriveNode {
  const access = accessOfItem(context, item);
  const entry = entryOf(item);
  return {
    key: item.id,
    parentKey: item.parentId,
    name: item.name,
    kind: kindOfItem(item),
    mime: mimeOf(item),
    size: sizeOf(item),
    childCount: item.kind === 'folder' ? item.childCount : null,
    files: item.kind === 'folder' ? item.totalFiles : null,
    modifiedAt: item.modifiedAt,
    hidden: item.name.startsWith('.'),
    byProfileId: item.addedByProfileId,
    marks: marksOf(item, context),
    exportable: entry === null && (!item.locked || canWrite(access)),
    writable: item.kind !== 'special' && canWrite(access),
    deletable: item.kind !== 'special' && canWrite(access),
    entry,
    origin: { kind: 'item', item, access },
  };
}

export function shortcutNodeOf(shortcut: DriveShortcut, context: DriveNodeContext): DriveNode {
  const { target } = shortcut;
  if (target.state === 'unavailable') {
    return {
      key: `${SHORTCUT_KEY_PREFIX}${shortcut.id}`,
      parentKey: shortcut.parentId,
      name: shortcut.name,
      kind: 'link',
      mime: null,
      size: null,
      childCount: null,
      files: null,
      modifiedAt: shortcut.createdAt,
      hidden: shortcut.name.startsWith('.'),
      byProfileId: shortcut.createdBy,
      marks: { ...NO_MARKS, shortcut: { unavailable: SHORTCUT_UNAVAILABLE_TEXT[target.reason] } },
      exportable: false,
      writable: true,
      deletable: true,
      entry: null,
      origin: { kind: 'shortcut', shortcut, item: null, access: 'none', target: null },
    };
  }
  const node = driveNodeOf(target.item, context);
  return {
    ...node,
    key: `${SHORTCUT_KEY_PREFIX}${shortcut.id}`,
    parentKey: shortcut.parentId,
    name: shortcut.name,
    hidden: shortcut.name.startsWith('.'),
    byProfileId: shortcut.createdBy,
    marks: { ...node.marks, shortcut: { unavailable: null } },
    exportable: node.exportable,
    writable: true,
    deletable: true,
    origin: {
      kind: 'shortcut',
      shortcut,
      item: target.item,
      access: accessOfItem(context, target.item),
      target: node,
    },
  };
}

export interface TrashRights {
  readonly owner: boolean;
  readonly viewerId: string | null;
  readonly roots: readonly DriveRootPlace[];
}

export function deletableFromTrash(entry: DriveTrashEntry, rights: TrashRights): boolean {
  if (rights.owner) return true;
  if (rights.viewerId !== null && entry.deletedBy === rights.viewerId) return true;
  const root = driveOfRootId(rights.roots, entry.rootId);
  return root !== null && isDriveOwner(root, rights.viewerId);
}

export function trashNodeOf(entry: DriveTrashEntry, rights: TrashRights): DriveNode {
  return {
    key: entry.itemId,
    parentKey: null,
    name: entry.name,
    kind: entry.isFolder ? 'folder' : kindOfFile(null, entry.name),
    mime: null,
    size: entry.isFolder ? null : entry.bytes,
    childCount: null,
    files: null,
    modifiedAt: entry.deletedAt,
    hidden: entry.name.startsWith('.'),
    byProfileId: entry.addedByProfileId,
    marks: NO_MARKS,
    exportable: false,
    writable: true,
    deletable: deletableFromTrash(entry, rights),
    entry: null,
    origin: { kind: 'trash', entry },
  };
}

export function itemOf(node: DriveNode): DriveItem | null {
  return node.origin.kind === 'trash' ? null : node.origin.item;
}

export function openTargetOf(node: DriveNode): DriveNode {
  return node.origin.kind === 'shortcut' && node.origin.target !== null ? node.origin.target : node;
}

export function itemIdOf(node: DriveNode): string {
  return openTargetOf(node).key;
}

export function itemsOf(nodes: readonly DriveNode[]): readonly DriveItem[] {
  return nodes.flatMap((node) => {
    const item = itemOf(node);
    return item === null ? [] : [item];
  });
}

export function entriesOf(
  items: readonly DriveItem[],
  shortcuts: readonly DriveShortcut[],
  context: DriveNodeContext,
): readonly DriveNode[] {
  const nodes = items.map((item) => driveNodeOf(item, context));
  const cuts = shortcuts.map((shortcut) => shortcutNodeOf(shortcut, context));
  return [...cuts, ...nodes];
}

export const DRIVE_TAB_IDS = ['comments', 'versions', 'activity', 'sharing'] as const;

export type DriveTabId = (typeof DRIVE_TAB_IDS)[number];

export function driveTabIdsOf(node: DriveNode): readonly DriveTabId[] {
  const item = itemOf(node);
  if (item === null || !isStoredItem(item)) return [];
  return DRIVE_TAB_IDS.filter((tab) => tab !== 'versions' || item.kind !== 'folder');
}

export type DriveInfoId = 'access' | 'colour' | 'computers' | 'edits';

export function driveInfoIdsOf(node: DriveNode): readonly DriveInfoId[] {
  const item = itemOf(node);
  if (item === null || !isStoredItem(item)) return [];
  return item.kind === 'folder'
    ? ['access', 'colour', 'computers']
    : ['access', 'computers', 'edits'];
}
