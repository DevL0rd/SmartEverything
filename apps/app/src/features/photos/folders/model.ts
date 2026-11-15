import type { PhotoFolder, PhotoFolderKind } from '@smarteverything/domain';
import { count } from '../../../format/number';
import { compareText } from '../../../format/text';
import type { LocalMediaItem } from '../local/types';

export type FolderCover =
  | { readonly kind: 'hub'; readonly itemId: string }
  | { readonly kind: 'local'; readonly localId: string; readonly video: boolean }
  | null;

export interface FolderView {
  readonly key: string;
  readonly kind: PhotoFolderKind;
  readonly name: string;
  readonly place: string;
  readonly local: number;
  readonly backedUp: number;
  readonly latest: number;
  readonly cover: FolderCover;
  readonly hidden: boolean;
  readonly backupId: string | null;
}

export type FolderGroupId = 'device' | 'devices' | 'drive';

export interface FolderGroup {
  readonly id: FolderGroupId;
  readonly title: string;
  readonly folders: readonly FolderView[];
}

interface LocalFolderTotal {
  readonly key: string;
  readonly name: string;
  readonly backupId: string;
  readonly local: number;
  readonly newest: LocalMediaItem;
}

export function localFoldersOf(items: readonly LocalMediaItem[]): readonly LocalFolderTotal[] {
  const totals = new Map<string, LocalFolderTotal>();
  for (const item of items) {
    if (item.folder === null) continue;
    const known = totals.get(item.folder.key);
    const newest = known === undefined || item.takenAt > known.newest.takenAt ? item : known.newest;
    totals.set(item.folder.key, {
      key: item.folder.key,
      name: item.folder.name,
      backupId: known === undefined ? item.folder.backupId : known.backupId,
      local: (known?.local ?? 0) + 1,
      newest,
    });
  }
  return [...totals.values()];
}

function hubLatest(folder: PhotoFolder | undefined): number {
  const at = folder?.latestAt ?? null;
  return at === null ? 0 : Date.parse(at);
}

function hubView(folder: PhotoFolder): FolderView {
  return {
    key: folder.key,
    kind: folder.kind,
    name: folder.name,
    place: folder.place,
    local: 0,
    backedUp: folder.count,
    latest: hubLatest(folder),
    cover: folder.coverItemId === null ? null : { kind: 'hub', itemId: folder.coverItemId },
    hidden: folder.hidden,
    backupId: null,
  };
}

export interface FolderInputs {
  readonly hub: readonly PhotoFolder[];
  readonly local: readonly LocalMediaItem[];
  readonly hidden: ReadonlySet<string>;
  readonly here: string;
}

function localView(total: LocalFolderTotal, inputs: FolderInputs): FolderView {
  const hub = inputs.hub.find((folder) => folder.key === total.key);
  return {
    key: total.key,
    kind: total.key.startsWith('computer:') ? 'computer' : 'phone',
    name: total.name,
    place: inputs.here,
    local: total.local,
    backedUp: hub?.count ?? 0,
    latest: Math.max(total.newest.takenAt, hubLatest(hub)),
    cover: { kind: 'local', localId: total.newest.id, video: total.newest.video },
    hidden: inputs.hidden.has(total.key),
    backupId: total.backupId,
  };
}

function byLatest(left: FolderView, right: FolderView): number {
  return right.latest - left.latest || compareText(left.name, right.name);
}

export function folderGroupsOf(inputs: FolderInputs): readonly FolderGroup[] {
  const device = localFoldersOf(inputs.local).map((total) => localView(total, inputs));
  const onDevice = new Set(device.map((folder) => folder.key));
  const hub = inputs.hub.filter((folder) => !onDevice.has(folder.key)).map(hubView);
  const groups: FolderGroup[] = [
    { id: 'device', title: inputs.here, folders: [...device].sort(byLatest) },
    {
      id: 'devices',
      title: 'Backed up from your devices',
      folders: hub.filter((folder) => folder.kind !== 'drive').sort(byLatest),
    },
    {
      id: 'drive',
      title: 'Drive folders',
      folders: hub.filter((folder) => folder.kind === 'drive').sort(byLatest),
    },
  ];
  return groups.filter((group) => group.folders.length > 0);
}

export function itemsLine(total: number): string {
  return total === 1 ? '1 item' : `${count(total)} items`;
}

export function countLineOf(folder: FolderView): string {
  if (folder.local === 0) return itemsLine(folder.backedUp);
  if (folder.backedUp === 0) return `${itemsLine(folder.local)} · not backed up`;
  return `${itemsLine(folder.local)} · ${count(Math.min(folder.backedUp, folder.local))} backed up`;
}

export function backedUpShare(folder: FolderView): number | null {
  if (folder.local === 0) return null;
  return Math.min(1, folder.backedUp / folder.local);
}

export function hiddenCountOf(groups: readonly FolderGroup[]): number {
  return groups.reduce(
    (sum, group) => sum + group.folders.filter((folder) => folder.hidden).length,
    0,
  );
}

const HEX_UNIT = /^[0-9a-f]{4}$/;

export function folderParamOf(key: string): string {
  return Array.from({ length: key.length }, (_, index) =>
    key.charCodeAt(index).toString(16).padStart(4, '0'),
  ).join('');
}

export function folderKeyOfParam(param: string): string | null {
  if (param.length === 0 || param.length % 4 !== 0) return null;
  const units = param.match(/.{4}/g) ?? [];
  if (!units.every((unit) => HEX_UNIT.test(unit))) return null;
  return String.fromCharCode(...units.map((unit) => Number.parseInt(unit, 16)));
}

export function backupIdsOf(groups: readonly FolderGroup[]): readonly string[] {
  const ids = groups.flatMap((group) => group.folders.map((folder) => folder.backupId));
  return [...new Set(ids.filter((id): id is string => id !== null))];
}
