import type { ReactNode } from 'react';
import type { DriveItem, DriveRoot, DriveSyncClient } from '@smarteverything/domain';
import { bytes, count } from '../../../format/number';
import { compareText, joinParts, naturalCompare, plural } from '../../../format/text';
import { duration } from '../../../format/time';

export type FolderKind = DriveItem['kind'];

export type KindFilter = 'all' | FolderKind;

export const FOLDER_SORT_KEYS = ['name', 'by', 'bytes', 'modifiedAt'] as const;

export type FolderSortKey = (typeof FOLDER_SORT_KEYS)[number];

export type SortDirection = 'asc' | 'desc';

export interface FolderSort {
  readonly key: FolderSortKey;
  readonly direction: SortDirection;
}

export const DEFAULT_SORT: FolderSort = { key: 'name', direction: 'asc' };

export type ByName = (profileId: string | null) => string | null;

export function itemsText(total: number): string {
  return `${count(total)} ${total === 1 ? 'item' : 'items'}`;
}

const KIND_ORDER: readonly FolderKind[] = [
  'folder',
  'image',
  'document',
  'video',
  'audio',
  'other',
];

const KIND_LABEL: Readonly<Record<FolderKind, string>> = {
  folder: 'Folders',
  image: 'Images',
  document: 'Documents',
  video: 'Videos',
  audio: 'Audio',
  other: 'Other',
};

const SORT_LABEL: Readonly<Record<FolderSortKey, readonly [string, string]>> = {
  name: ['Name, A to Z', 'Name, Z to A'],
  by: ['By, A to Z', 'By, Z to A'],
  bytes: ['Size, smallest first', 'Size, largest first'],
  modifiedAt: ['Modified, oldest first', 'Modified, newest first'],
};

const FIRST_DIRECTION: Readonly<Record<FolderSortKey, SortDirection>> = {
  name: 'asc',
  by: 'asc',
  bytes: 'desc',
  modifiedAt: 'desc',
};

export interface SortOption {
  readonly value: string;
  readonly label: string;
}

export function sortValueOf(sort: FolderSort): string {
  return `${sort.key}:${sort.direction}`;
}

export const SORT_OPTIONS: readonly SortOption[] = FOLDER_SORT_KEYS.flatMap((key) =>
  (['asc', 'desc'] as const).map((direction) => ({
    value: sortValueOf({ key, direction }),
    label: SORT_LABEL[key][direction === 'asc' ? 0 : 1],
  })),
);

export function sortOfValue(value: string): FolderSort {
  const [key, direction] = value.split(':');
  const known = FOLDER_SORT_KEYS.find((candidate) => candidate === key);
  if (known === undefined || (direction !== 'asc' && direction !== 'desc')) return DEFAULT_SORT;
  return { key: known, direction };
}

export function sortLabelOf(sort: FolderSort): string {
  return SORT_LABEL[sort.key][sort.direction === 'asc' ? 0 : 1];
}

export function columnSort(current: FolderSort, key: FolderSortKey): FolderSort {
  if (current.key !== key) return { key, direction: FIRST_DIRECTION[key] };
  return { key, direction: current.direction === 'asc' ? 'desc' : 'asc' };
}

function sizeOf(item: DriveItem): number {
  return item.bytes;
}

function fieldCompare(sort: FolderSort, byName: ByName, left: DriveItem, right: DriveItem): number {
  switch (sort.key) {
    case 'name':
      return naturalCompare(left.name, right.name);
    case 'by':
      return compareText(byName(left.addedByProfileId) ?? '', byName(right.addedByProfileId) ?? '');
    case 'bytes':
      return sizeOf(left) - sizeOf(right);
    case 'modifiedAt':
      return Date.parse(left.modifiedAt) - Date.parse(right.modifiedAt);
  }
}

export function sortItems(
  items: readonly DriveItem[],
  sort: FolderSort,
  byName: ByName,
): readonly DriveItem[] {
  const sign = sort.direction === 'asc' ? 1 : -1;
  return [...items].sort((left, right) => {
    const folders = Number(right.kind === 'folder') - Number(left.kind === 'folder');
    if (folders !== 0) return folders;
    const field = sign * fieldCompare(sort, byName, left, right);
    if (field !== 0) return field;
    return naturalCompare(left.name, right.name) || compareText(left.id, right.id);
  });
}

export interface KindChip {
  readonly kind: KindFilter;
  readonly label: string;
  readonly count: number | null;
}

export function kindChipsOf(items: readonly DriveItem[], complete: boolean): readonly KindChip[] {
  const counts = new Map<FolderKind, number>();
  for (const item of items) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
  const present = KIND_ORDER.filter((kind) => counts.has(kind));
  return [
    { kind: 'all', label: 'All', count: complete ? items.length : null },
    ...present.map((kind) => ({
      kind,
      label: KIND_LABEL[kind],
      count: complete ? (counts.get(kind) ?? 0) : null,
    })),
  ];
}

export function itemsOfKind(items: readonly DriveItem[], kind: KindFilter): readonly DriveItem[] {
  return kind === 'all' ? items : items.filter((item) => item.kind === kind);
}

export interface FolderSelection {
  readonly ids: ReadonlySet<string>;
  readonly anchor: string | null;
  readonly focus: string | null;
}

export const NO_SELECTION: FolderSelection = { ids: new Set(), anchor: null, focus: null };

export function selectOne(id: string): FolderSelection {
  return { ids: new Set([id]), anchor: id, focus: id };
}

export function toggleOne(selection: FolderSelection, id: string): FolderSelection {
  const ids = new Set(selection.ids);
  if (!ids.delete(id)) ids.add(id);
  return { ids, anchor: id, focus: id };
}

export function selectRange(
  selection: FolderSelection,
  order: readonly string[],
  id: string,
): FolderSelection {
  const from = selection.anchor === null ? -1 : order.indexOf(selection.anchor);
  const to = order.indexOf(id);
  if (from === -1 || to === -1 || selection.anchor === null) return selectOne(id);
  const [low, high] = from <= to ? [from, to] : [to, from];
  return { ids: new Set(order.slice(low, high + 1)), anchor: selection.anchor, focus: id };
}

export function selectAllOf(order: readonly string[]): FolderSelection {
  const first = order[0] ?? null;
  return { ids: new Set(order), anchor: first, focus: order.at(-1) ?? null };
}

function focusIndex(selection: FolderSelection, order: readonly string[], step: number): number {
  const at = selection.focus === null ? -1 : order.indexOf(selection.focus);
  if (at === -1) return step > 0 ? 0 : order.length - 1;
  return Math.min(Math.max(at + step, 0), order.length - 1);
}

export function moveFocus(
  selection: FolderSelection,
  order: readonly string[],
  step: number,
  extend: boolean,
): FolderSelection {
  const target = order[focusIndex(selection, order, step)];
  if (target === undefined) return selection;
  return extend ? selectRange(selection, order, target) : selectOne(target);
}

export interface ScrollWindow {
  readonly offset: number;
  readonly viewport: number;
}

export function revealOffset(
  index: number,
  rowHeight: number,
  window: ScrollWindow,
): number | null {
  const top = index * rowHeight;
  if (top < window.offset) return top;
  const bottom = top + rowHeight;
  return bottom > window.offset + window.viewport ? bottom - window.viewport : null;
}

export function pickedOf(
  items: readonly DriveItem[],
  selection: FolderSelection,
): readonly DriveItem[] {
  return items.filter((item) => selection.ids.has(item.id));
}

export function syncedComputers(root: DriveRoot, clients: readonly DriveSyncClient[]): number {
  if (!root.synced) return 0;
  const computers = clients
    .filter((client) => client.rootId === root.id && client.enabled)
    .map((client) => client.deviceId);
  return new Set(computers).size;
}

export interface FolderTotals {
  readonly items: number;
  readonly bytes: number;
}

export function totalsOf(root: DriveRoot, folder: DriveItem | null): FolderTotals {
  if (folder?.kind === 'folder') return { items: folder.childCount, bytes: folder.bytes };
  return { items: root.items, bytes: root.bytes };
}

export function folderSubtitle(totals: FolderTotals, readOnly: boolean, computers: number): string {
  return joinParts([
    itemsText(totals.items),
    bytes(totals.bytes),
    readOnly ? 'read only' : null,
    computers === 0 ? null : `synced to ${plural(computers, 'computer')}`,
  ]);
}

export function footerLine(totals: FolderTotals, shown: number | null, selected: number): string {
  return joinParts([
    itemsText(totals.items),
    bytes(totals.bytes),
    shown === null ? null : `${count(shown)} shown`,
    selected === 0 ? null : `${count(selected)} selected`,
  ]);
}

export type CrumbTarget =
  | { readonly kind: 'drive' }
  | { readonly kind: 'root' }
  | { readonly kind: 'folder'; readonly id: string };

export interface CrumbSpec {
  readonly key: string;
  readonly label: string;
  readonly target: CrumbTarget | null;
}

function folderCrumbs(folder: DriveItem): readonly CrumbSpec[] {
  const parts = folder.relPath.split('/');
  const parent = parts.length - 2;
  return parts.map((label, index) => ({
    key: parts.slice(0, index + 1).join('/'),
    label,
    target:
      index === parent && folder.parentId !== null ? { kind: 'folder', id: folder.parentId } : null,
  }));
}

export function crumbsOf(root: DriveRoot, folder: DriveItem | null): readonly CrumbSpec[] {
  const top: readonly CrumbSpec[] = [
    { key: 'drive', label: 'My Drive', target: { kind: 'drive' } },
    { key: 'root', label: root.label, target: folder === null ? null : { kind: 'root' } },
  ];
  if (folder === null) return top;
  const inner = folderCrumbs(folder);
  return [...top, ...inner.slice(0, -1)];
}

export function titleOf(root: DriveRoot, folder: DriveItem | null): string {
  return folder?.name ?? root.label;
}

export const OUTSIDE_LINE = 'Changed outside SmartEverything';

function kindLine(item: DriveItem): string | null {
  switch (item.kind) {
    case 'folder':
      return itemsText(item.childCount);
    case 'video':
    case 'audio':
      return item.durationMs === null ? null : duration(Math.round(item.durationMs / 1000));
    case 'image':
    case 'document':
    case 'other':
      return null;
  }
}

export function captionOf(item: DriveItem): string | null {
  const line = kindLine(item);
  if (!item.outside) return line;
  return joinParts([line, OUTSIDE_LINE]);
}

export type FolderAction = 'open' | 'details' | 'star' | 'unstar' | 'download' | 'rename' | 'trash';

export interface FolderAbilities {
  readonly writable: boolean;
  readonly details: boolean;
}

export function actionsOf(item: DriveItem, abilities: FolderAbilities): readonly FolderAction[] {
  return [
    'open',
    ...(abilities.details ? (['details'] as const) : []),
    item.starred ? 'unstar' : 'star',
    ...(item.kind === 'folder' ? [] : (['download'] as const)),
    ...(abilities.writable ? (['rename', 'trash'] as const) : []),
  ];
}

export type FolderIssue =
  | { readonly kind: 'private' }
  | { readonly kind: 'unreadable'; readonly label: string; readonly path: string | null }
  | { readonly kind: 'scanning' };

export function issueOf(root: DriveRoot | null): FolderIssue | null {
  if (root === null) return { kind: 'private' };
  if (root.state === 'scanning') return { kind: 'scanning' };
  if (root.state === 'ready') return null;
  return { kind: 'unreadable', label: root.label, path: root.path };
}

export interface FolderSlotContext {
  readonly root: DriveRoot;
  readonly folder: DriveItem | null;
  readonly items: readonly DriveItem[];
  readonly picked: readonly DriveItem[];
  readonly focused: DriveItem | null;
  readonly close: () => void;
}

export interface FolderSlots {
  readonly details?: (context: FolderSlotContext) => ReactNode;
  readonly upload?: (context: FolderSlotContext) => ReactNode;
  readonly quickLook?: (context: FolderSlotContext) => ReactNode;
}
