import type { SyncActivity, SyncthingSnapshot } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon';
import { joinParts } from '../../../format/text';
import { dayLabel, localDayKey } from '../../../format/time';
import { folderLabel, peerName } from '../syncthing-data';

export const ACTIVITY_FILTERS = ['all', 'files', 'devices', 'errors'] as const;

export type ActivityFilter = (typeof ACTIVITY_FILTERS)[number];

export const ACTIVITY_FILTER_LABEL: Readonly<Record<ActivityFilter, string>> = {
  all: 'All',
  files: 'Files',
  devices: 'Devices',
  errors: 'Errors',
};

export const ALL_FOLDERS = '';

export const ACTIVITY_PAGE = 50;

const KIND_ICON: Readonly<Record<SyncActivity['kind'], IconName>> = {
  added: 'plus',
  modified: 'pencil',
  deleted: 'trash',
  connected: 'link',
  disconnected: 'plug',
  paused: 'pause',
  resumed: 'play',
  error: 'warning',
};

const KIND_WORD: Readonly<Record<SyncActivity['kind'], string>> = {
  added: 'Added',
  modified: 'Changed',
  deleted: 'Deleted',
  connected: 'Connected',
  disconnected: 'Disconnected',
  paused: 'Paused',
  resumed: 'Resumed',
  error: 'Couldn’t sync',
};

const FILTER_TEST: Readonly<Record<ActivityFilter, (entry: SyncActivity) => boolean>> = {
  all: () => true,
  files: (entry) => entry.path !== null && entry.kind !== 'error',
  devices: (entry) => entry.path === null && entry.folderId === null,
  errors: (entry) => entry.kind === 'error',
};

export function activityMatches(
  entry: SyncActivity,
  filter: ActivityFilter,
  folderId: string,
): boolean {
  return FILTER_TEST[filter](entry) && (folderId === ALL_FOLDERS || entry.folderId === folderId);
}

export function filterCounts(
  entries: readonly SyncActivity[],
  folderId: string,
): Readonly<Record<ActivityFilter, number>> {
  const count = (filter: ActivityFilter): number =>
    entries.filter((entry) => activityMatches(entry, filter, folderId)).length;
  return {
    all: count('all'),
    files: count('files'),
    devices: count('devices'),
    errors: count('errors'),
  };
}

export interface ActivityDay {
  readonly key: string;
  readonly label: string;
  readonly entries: readonly SyncActivity[];
}

export function groupByDay(entries: readonly SyncActivity[], now: number): readonly ActivityDay[] {
  const days: { key: string; label: string; entries: SyncActivity[] }[] = [];
  for (const entry of entries) {
    const key = localDayKey(entry.at);
    const last = days[days.length - 1];
    if (last?.key === key) {
      last.entries.push(entry);
    } else {
      days.push({ key, label: dayLabel(entry.at, now), entries: [entry] });
    }
  }
  return days;
}

export interface ActivityLine {
  readonly icon: IconName;
  readonly critical: boolean;
  readonly word: string;
  readonly name: string;
  readonly file: boolean;
  readonly detail: string | null;
  readonly detailPath: boolean;
}

const SEPARATOR = /[\\/]/;

function splitPath(path: string): { readonly name: string; readonly directory: string } {
  const cut = path.split(SEPARATOR);
  const name = cut.pop() ?? path;
  return { name, directory: cut.join('/') };
}

function targetOf(entry: SyncActivity, snapshot: SyncthingSnapshot | null): string {
  return folderLabel(snapshot, entry.folderId) ?? peerName(snapshot, entry.deviceId) ?? 'Syncthing';
}

function fileLine(
  entry: SyncActivity,
  path: string,
  snapshot: SyncthingSnapshot | null,
): Pick<ActivityLine, 'name' | 'detail' | 'detailPath'> {
  const { name, directory } = splitPath(path);
  const from = entry.remote
    ? `from ${peerName(snapshot, entry.deviceId) ?? 'another device'}`
    : null;
  return {
    name,
    detail: joinParts([folderLabel(snapshot, entry.folderId), from, directory]),
    detailPath: directory.includes('/'),
  };
}

function deviceDetail(entry: SyncActivity, snapshot: SyncthingSnapshot | null): string | null {
  if (entry.kind !== 'connected') {
    return null;
  }
  return snapshot?.peers.find((peer) => peer.id === entry.deviceId)?.address ?? null;
}

export function activityLineOf(
  entry: SyncActivity,
  snapshot: SyncthingSnapshot | null,
): ActivityLine {
  const base = {
    icon: KIND_ICON[entry.kind],
    critical: entry.kind === 'error',
    word: KIND_WORD[entry.kind],
  };
  if (entry.path !== null) {
    return { ...base, file: true, ...fileLine(entry, entry.path, snapshot) };
  }
  return {
    ...base,
    file: false,
    name: targetOf(entry, snapshot),
    detail: deviceDetail(entry, snapshot),
    detailPath: false,
  };
}
