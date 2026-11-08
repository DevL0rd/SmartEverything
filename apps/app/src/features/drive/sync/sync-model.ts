import type {
  DriveConflict,
  DriveRecentEntry,
  DriveRoot,
  DriveSyncClient,
  DriveVia,
} from '@smarteverything/domain';
import type { Bar, ChartPoint } from '../../../components/charts';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';
import { dayKeyOf, relative, shiftDay, startOfDayKey } from '../../../format/time';
import { haveShare, itemsTextOf } from '../roots/root-card-model';

export const CHANGE_DAYS = 14;

export const HOUR_MS = 3_600_000;

export const HOUR_STEPS = 12;

const STEP_MS = HOUR_MS / HOUR_STEPS;

export const SYNC_CLIENT_STATES = [
  'upToDate',
  'moving',
  'waiting',
  'offline',
  'conflict',
  'failed',
  'blocked',
  'rescanning',
  'resuming',
] as const;

export type SyncClientState = (typeof SYNC_CLIENT_STATES)[number];

export type SyncClientStatus =
  | { readonly state: 'upToDate' }
  | { readonly state: 'moving'; readonly needBytes: number }
  | { readonly state: 'waiting'; readonly needBytes: number }
  | { readonly state: 'offline'; readonly needBytes: number }
  | {
      readonly state: 'conflict';
      readonly conflicts: number;
      readonly more: boolean;
      readonly file: string | null;
    }
  | { readonly state: 'failed'; readonly problems: number; readonly message: string }
  | { readonly state: 'blocked'; readonly reason: string }
  | { readonly state: 'rescanning' }
  | { readonly state: 'resuming'; readonly offsetBytes: number };

export type SyncSentenceTone = 'default' | 'variant' | 'warning' | 'critical';

export interface SyncStateLook {
  readonly ring: ColourRole;
  readonly sentence: SyncSentenceTone;
}

export const SYNC_STATE_LOOK: Readonly<Record<SyncClientState, SyncStateLook>> = {
  upToDate: { ring: 'positive', sentence: 'variant' },
  moving: { ring: 'info', sentence: 'default' },
  waiting: { ring: 'warning', sentence: 'warning' },
  offline: { ring: 'track', sentence: 'variant' },
  conflict: { ring: 'warning', sentence: 'warning' },
  failed: { ring: 'critical', sentence: 'critical' },
  blocked: { ring: 'warning', sentence: 'warning' },
  rescanning: { ring: 'info', sentence: 'default' },
  resuming: { ring: 'info', sentence: 'default' },
};

export function fileNameOf(relPath: string): string {
  return relPath.split('/').at(-1) ?? relPath;
}

function conflictSentence(status: Extract<SyncClientStatus, { state: 'conflict' }>): string {
  if (status.conflicts === 1 && !status.more && status.file !== null) {
    return `1 conflict · ${status.file}`;
  }
  return `${count(status.conflicts)}${status.more ? '+' : ''} conflicts wait for you`;
}

function failedSentence(status: Extract<SyncClientStatus, { state: 'failed' }>): string {
  return status.problems === 1
    ? `Failed · ${status.message}`
    : `${count(status.problems)} problems · ${status.message}`;
}

function offlineSentence(needBytes: number): string {
  return needBytes > 0 ? `Offline · ${bytes(needBytes)} waiting` : 'Offline';
}

export function syncSentenceOf(status: SyncClientStatus): string {
  switch (status.state) {
    case 'upToDate':
      return 'Up to date';
    case 'moving':
      return `Getting ${bytes(status.needBytes)}`;
    case 'waiting':
      return `Waiting · ${bytes(status.needBytes)} to get`;
    case 'offline':
      return offlineSentence(status.needBytes);
    case 'conflict':
      return conflictSentence(status);
    case 'failed':
      return failedSentence(status);
    case 'blocked':
      return `Blocked · ${status.reason}`;
    case 'rescanning':
      return 'Rescanning the folder after many changes';
    case 'resuming':
      return `Resuming at ${bytes(status.offsetBytes)}`;
  }
}

export interface ClientFacts {
  readonly client: DriveSyncClient;
  readonly online: boolean;
  readonly conflicts: readonly DriveConflict[];
  readonly moreConflicts: boolean;
}

export function clientStatusOf(facts: ClientFacts): SyncClientStatus {
  const { client, online, conflicts, moreConflicts } = facts;
  const [error] = client.errors;
  if (error !== undefined) {
    return { state: 'failed', problems: client.errors.length, message: error.message };
  }
  const [first] = conflicts;
  if (first !== undefined) {
    const file = conflicts.length === 1 ? fileNameOf(first.relPath) : null;
    return { state: 'conflict', conflicts: conflicts.length, more: moreConflicts, file };
  }
  if (!online) return { state: 'offline', needBytes: client.needBytes };
  if (client.needBytes > 0) return { state: 'moving', needBytes: client.needBytes };
  return { state: 'upToDate' };
}

const STATE_RANK: Readonly<Record<SyncClientState, number>> = {
  failed: 8,
  blocked: 7,
  conflict: 6,
  waiting: 5,
  resuming: 4,
  rescanning: 3,
  moving: 2,
  offline: 1,
  upToDate: 0,
};

export function worstStatusOf(statuses: readonly SyncClientStatus[]): SyncClientStatus {
  return statuses.reduce<SyncClientStatus>(
    (worst, status) => (STATE_RANK[status.state] > STATE_RANK[worst.state] ? status : worst),
    { state: 'upToDate' },
  );
}

export function needOf(status: SyncClientStatus): number {
  return 'needBytes' in status ? status.needBytes : 0;
}

export function selectiveOf(selected: readonly string[]): string | null {
  const names = selected.map(fileNameOf);
  const last = names.at(-1);
  if (last === undefined) return null;
  const head = names.slice(0, -1);
  return `${head.length === 0 ? last : `${head.join(', ')} and ${last}`} only`;
}

export interface SyncChange {
  readonly rootId: string;
  readonly via: DriveVia;
  readonly deviceId: string | null;
  readonly at: string;
  readonly bytes: number;
}

export function syncChangesOf(entries: readonly DriveRecentEntry[]): readonly SyncChange[] {
  return entries.flatMap((entry) =>
    entry.kind === 'opened'
      ? []
      : [
          {
            rootId: entry.item.rootId,
            via: entry.via,
            deviceId: entry.deviceId,
            at: entry.at,
            bytes: entry.item.kind === 'folder' ? 0 : entry.item.bytes,
          },
        ],
  );
}

export function changeWindowCovered(entries: readonly DriveRecentEntry[], today: string): boolean {
  const last = entries.at(-1);
  return (
    last !== undefined && Date.parse(last.at) < startOfDayKey(shiftDay(today, 1 - CHANGE_DAYS))
  );
}

export interface HourSeries {
  readonly points: readonly ChartPoint[];
  readonly bytes: number;
  readonly files: number;
}

function synced(changes: readonly SyncChange[], deviceId: string | null): readonly SyncChange[] {
  return changes.filter(
    (change) => change.via === 'sync' && (deviceId === null || change.deviceId === deviceId),
  );
}

export function lastHourOf(
  changes: readonly SyncChange[],
  now: number,
  deviceId: string | null,
): HourSeries {
  const start = now - HOUR_MS;
  const shown = synced(changes, deviceId).filter((change) => {
    const at = Date.parse(change.at);
    return at > start && at <= now;
  });
  const steps = Array.from({ length: HOUR_STEPS }, () => 0);
  for (const change of shown) {
    const step = Math.min(HOUR_STEPS - 1, Math.floor((Date.parse(change.at) - start) / STEP_MS));
    steps[step] = (steps[step] ?? 0) + change.bytes;
  }
  return {
    points: steps.map((value, index) => ({ t: start + (index + 1) * STEP_MS, v: value })),
    bytes: shown.reduce((all, change) => all + change.bytes, 0),
    files: shown.length,
  };
}

export interface DayTotal {
  readonly bytes: number;
  readonly files: number;
}

export function movedTodayOf(changes: readonly SyncChange[], today: string): DayTotal {
  const start = startOfDayKey(today);
  const end = startOfDayKey(shiftDay(today, 1));
  const shown = synced(changes, null).filter((change) => {
    const at = Date.parse(change.at);
    return at >= start && at < end;
  });
  return { bytes: shown.reduce((all, change) => all + change.bytes, 0), files: shown.length };
}

export function changeDaysOf(today: string): readonly string[] {
  return Array.from({ length: CHANGE_DAYS }, (_, index) =>
    shiftDay(today, index - CHANGE_DAYS + 1),
  );
}

export function changeBarsOf(
  changes: readonly SyncChange[],
  rootId: string,
  today: string,
): readonly Bar[] {
  const totals = new Map<string, number>();
  for (const change of changes) {
    if (change.rootId !== rootId) continue;
    const day = dayKeyOf(Date.parse(change.at));
    totals.set(day, (totals.get(day) ?? 0) + 1);
  }
  return changeDaysOf(today).map((day) => ({ key: day, value: totals.get(day) ?? 0 }));
}

export function rateOf(series: HourSeries): string | null {
  return series.bytes > 0 ? `${bytes(series.bytes)}/h` : null;
}

export interface SyncClientView {
  readonly key: string;
  readonly name: string;
  readonly status: SyncClientStatus;
  readonly ring: number;
  readonly sentence: string;
  readonly details: string;
  readonly selective: boolean;
  readonly series: readonly ChartPoint[];
  readonly rate: string | null;
  readonly spoken: string;
}

export interface ClientViewInputs {
  readonly key: string;
  readonly name: string;
  readonly status: SyncClientStatus;
  readonly rootBytes: number;
  readonly lastSeenAt: string | null;
  readonly online: boolean;
  readonly selected: readonly string[];
  readonly extra: string | null;
  readonly hour: HourSeries;
  readonly now: number;
}

export function lastSeenOf(lastSeenAt: string | null, online: boolean, now: number): string {
  if (lastSeenAt === null) return 'never seen';
  return online ? 'seen now' : `seen ${relative(lastSeenAt, now)}`;
}

export function clientViewOf(inputs: ClientViewInputs): SyncClientView {
  const { status, hour } = inputs;
  const sentence = syncSentenceOf(status);
  const details = joinParts([
    inputs.extra,
    selectiveOf(inputs.selected),
    lastSeenOf(inputs.lastSeenAt, inputs.online, inputs.now),
  ]);
  const rate = status.state === 'upToDate' || status.state === 'offline' ? null : rateOf(hour);
  return {
    key: inputs.key,
    name: inputs.name,
    status,
    ring: haveShare(inputs.rootBytes, needOf(status)),
    sentence,
    details,
    selective: inputs.selected.length > 0,
    series: rate === null ? [] : hour.points,
    rate,
    spoken: joinParts([inputs.name, sentence, details, rate]),
  };
}

export interface FolderSummaryInputs {
  readonly root: DriveRoot;
  readonly changes: number;
  readonly selective: number;
}

export function folderSubtitleOf({ root, changes, selective }: FolderSummaryInputs): string {
  return joinParts([
    bytes(root.bytes),
    itemsTextOf(root.items),
    `${plural(changes, 'change')} in ${String(CHANGE_DAYS)} days`,
    selective === 0 ? null : `selective on ${plural(selective, 'computer')}`,
  ]);
}

export function syncedRootsOf(roots: readonly DriveRoot[]): readonly DriveRoot[] {
  return roots.filter((root) => root.synced);
}

export function syncableRootsOf(roots: readonly DriveRoot[]): readonly DriveRoot[] {
  return roots.filter((root) => root.path !== null && !root.synced);
}

export function syncSubtitleOf(folders: number, computers: number, line: string | null): string {
  if (folders === 0) return 'No synced folders yet';
  return joinParts([
    `${plural(folders, 'synced folder')} on ${plural(computers, 'computer')}`,
    line,
  ]);
}
