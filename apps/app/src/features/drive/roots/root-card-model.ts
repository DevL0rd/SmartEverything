import type {
  DriveConflict,
  DriveRoot,
  DriveStats,
  DriveSyncClient,
  SMART_RULE_ITEM_KINDS,
} from '@smarteverything/domain';
import type { BarSegment } from '../../../components/charts';
import type { Dot } from '../../../components/dot-strip';
import type { IconName } from '../../../components/icon';
import type { BadgeTone } from '../../../components/badge';
import type { StatusTone } from '../../../components/tone';
import type { ColourRole } from '../../../design/tokens';
import { bytes, count } from '../../../format/number';
import { joinParts, plural } from '../../../format/text';

type ItemKind = (typeof SMART_RULE_ITEM_KINDS)[number];

export type DriveStatsKind = DriveStats['kinds'][number];

export type DriveStatsVolume = DriveStats['volumes'][number];

export const KIND_COLOUR: Readonly<Record<ItemKind, ColourRole>> = {
  image: 'viz-1',
  video: 'viz-3',
  document: 'viz-6',
  audio: 'viz-4',
  other: 'track',
};

export const KIND_LABEL: Readonly<Record<ItemKind, string>> = {
  image: 'Images',
  video: 'Videos',
  document: 'Documents',
  audio: 'Audio',
  other: 'Other',
};

export type SyncLineState = 'upToDate' | 'syncing' | 'conflict' | 'offline' | 'failed';

export type SyncLineTone = StatusTone | 'offline';

export interface SyncComputer {
  readonly deviceId: string;
  readonly name: string;
  readonly online: boolean;
}

export interface SyncComputerDot {
  readonly key: string;
  readonly name: string;
  readonly state: Dot['state'];
  readonly tone: StatusTone | null;
  readonly label: string;
}

export interface SyncLine {
  readonly state: SyncLineState;
  readonly tone: SyncLineTone;
  readonly ring: number;
  readonly sentence: string;
  readonly computers: readonly SyncComputerDot[];
}

export interface OpenRootConflicts {
  readonly items: readonly DriveConflict[];
  readonly more: boolean;
}

export interface SyncLineInputs {
  readonly rootBytes: number;
  readonly clients: readonly DriveSyncClient[];
  readonly conflicts: OpenRootConflicts;
  readonly computers: ReadonlyMap<string, SyncComputer>;
}

const UNKNOWN_COMPUTER = 'Unknown computer';

function nameOf(computers: ReadonlyMap<string, SyncComputer>, deviceId: string): string {
  return computers.get(deviceId)?.name ?? UNKNOWN_COMPUTER;
}

function onlineOf(computers: ReadonlyMap<string, SyncComputer>, deviceId: string): boolean {
  return computers.get(deviceId)?.online ?? false;
}

function computersText(
  clients: readonly DriveSyncClient[],
  computers: ReadonlyMap<string, SyncComputer>,
): string {
  const ids = [...new Set(clients.map((client) => client.deviceId))];
  const [only] = ids;
  return ids.length === 1 && only !== undefined
    ? nameOf(computers, only)
    : plural(ids.length, 'computer');
}

function needOf(clients: readonly DriveSyncClient[]): number {
  return clients.reduce((all, client) => all + client.needBytes, 0);
}

export function haveShare(rootBytes: number, needBytes: number): number {
  if (needBytes <= 0) return 1;
  return 1 - needBytes / Math.max(rootBytes, needBytes);
}

function ringOf(rootBytes: number, clients: readonly DriveSyncClient[]): number {
  return clients.reduce(
    (least, client) => Math.min(least, haveShare(rootBytes, client.needBytes)),
    1,
  );
}

function fileName(relPath: string): string {
  return relPath.split('/').at(-1) ?? relPath;
}

export function conflictSentence(
  conflicts: OpenRootConflicts,
  computers: ReadonlyMap<string, SyncComputer>,
): string {
  const [first] = conflicts.items;
  if (conflicts.items.length === 1 && !conflicts.more && first !== undefined) {
    return `1 conflict on ${nameOf(computers, first.deviceId)} · ${fileName(first.relPath)}`;
  }
  const total = conflicts.more
    ? `${count(conflicts.items.length)}+ conflicts`
    : `${count(conflicts.items.length)} conflicts`;
  return `${total} wait for you`;
}

function upToDateSentence(
  clients: readonly DriveSyncClient[],
  computers: ReadonlyMap<string, SyncComputer>,
): string {
  const offline = clients.filter((client) => !onlineOf(computers, client.deviceId));
  const total = new Set(clients.map((client) => client.deviceId)).size;
  if (offline.length === 0) return `Up to date on ${plural(total, 'computer')}`;
  const online = total - new Set(offline.map((client) => client.deviceId)).size;
  return `Up to date on ${String(online)} of ${String(total)} · ${computersText(offline, computers)} offline`;
}

function offlineSentence(clients: readonly DriveSyncClient[]): string {
  const need = needOf(clients);
  return need > 0
    ? `Offline · ${bytes(need)} waiting`
    : `Offline on ${plural(new Set(clients.map((client) => client.deviceId)).size, 'computer')}`;
}

function stateOf(inputs: SyncLineInputs): SyncLineState {
  const { clients, conflicts, computers } = inputs;
  if (clients.some((client) => client.errors.length > 0)) return 'failed';
  if (conflicts.items.length > 0) return 'conflict';
  const online = clients.filter((client) => onlineOf(computers, client.deviceId));
  if (online.some((client) => client.needBytes > 0)) return 'syncing';
  return online.length === 0 ? 'offline' : 'upToDate';
}

const STATE_TONE: Readonly<Record<SyncLineState, SyncLineTone>> = {
  upToDate: 'positive',
  syncing: 'info',
  conflict: 'warning',
  offline: 'offline',
  failed: 'critical',
};

function sentenceOf(state: SyncLineState, inputs: SyncLineInputs): string {
  const { clients, conflicts, computers } = inputs;
  if (state === 'failed') {
    return `Sync failed on ${computersText(
      clients.filter((client) => client.errors.length > 0),
      computers,
    )}`;
  }
  if (state === 'conflict') return conflictSentence(conflicts, computers);
  if (state === 'offline') return offlineSentence(clients);
  if (state === 'upToDate') return upToDateSentence(clients, computers);
  const moving = clients.filter(
    (client) => client.needBytes > 0 && onlineOf(computers, client.deviceId),
  );
  return `${computersText(moving, computers)} · ${bytes(needOf(moving))} left`;
}

function ringClientsOf(state: SyncLineState, inputs: SyncLineInputs): readonly DriveSyncClient[] {
  if (state !== 'syncing') return inputs.clients;
  return inputs.clients.filter((client) => onlineOf(inputs.computers, client.deviceId));
}

function dotToneOf(
  client: DriveSyncClient,
  conflicted: ReadonlySet<string>,
): { readonly tone: StatusTone; readonly word: string } {
  if (client.errors.length > 0) return { tone: 'critical', word: 'sync failed' };
  if (conflicted.has(client.deviceId)) return { tone: 'warning', word: 'conflict' };
  if (client.needBytes > 0) return { tone: 'info', word: `${bytes(client.needBytes)} left` };
  return { tone: 'positive', word: 'up to date' };
}

function dotOf(
  client: DriveSyncClient,
  computers: ReadonlyMap<string, SyncComputer>,
  conflicted: ReadonlySet<string>,
): SyncComputerDot {
  const computer = computers.get(client.deviceId);
  const name = computer?.name ?? UNKNOWN_COMPUTER;
  if (computer?.online !== true) {
    const state = computer === undefined ? 'unknown' : 'offline';
    return { key: client.clientId, name, state, tone: null, label: `${name}, offline` };
  }
  const { tone, word } = dotToneOf(client, conflicted);
  return { key: client.clientId, name, state: 'on', tone, label: `${name}, ${word}` };
}

export function syncLineOf(inputs: SyncLineInputs): SyncLine | null {
  const clients = inputs.clients.filter((client) => client.enabled);
  if (clients.length === 0) return null;
  const enabled = { ...inputs, clients };
  const state = stateOf(enabled);
  const conflicted = new Set(inputs.conflicts.items.map((conflict) => conflict.deviceId));
  return {
    state,
    tone: STATE_TONE[state],
    ring: ringOf(inputs.rootBytes, ringClientsOf(state, enabled)),
    sentence: sentenceOf(state, enabled),
    computers: clients.map((client) => dotOf(client, inputs.computers, conflicted)),
  };
}

export interface RootBadge {
  readonly label: string;
  readonly tone: BadgeTone;
  readonly icon: IconName;
}

export interface RootStateLine {
  readonly text: string;
  readonly tone: StatusTone;
  readonly icon: IconName;
}

export interface RootVolumeBar {
  readonly segments: readonly BarSegment[];
  readonly total: number;
  readonly caption: string;
}

export interface RootCardModel {
  readonly glyph: IconName;
  readonly subtitle: string;
  readonly mono: boolean;
  readonly badges: readonly RootBadge[];
  readonly used: string;
  readonly volume: RootVolumeBar | null;
  readonly kinds: readonly BarSegment[];
  readonly items: string;
  readonly state: RootStateLine;
}

const GLYPH: Readonly<Record<DriveRoot['kind'], IconName>> = {
  folder: 'folder',
  volume: 'hardDrive',
  managed: 'server',
  cameras: 'cameras',
  ai_images: 'sparkles',
};

function subtitleOf(root: DriveRoot): { readonly subtitle: string; readonly mono: boolean } {
  if (root.kind === 'managed') return { subtitle: 'On the hub', mono: false };
  if (root.kind === 'cameras') return { subtitle: 'Kept camera clips', mono: false };
  if (root.kind === 'ai_images') return { subtitle: 'Images the assistant made', mono: false };
  return { subtitle: root.path, mono: true };
}

export function rootBadgesOf(root: DriveRoot): readonly RootBadge[] {
  return [
    ...(root.scope === 'person'
      ? [{ label: 'Private', tone: 'neutral', icon: 'lock' } as const]
      : []),
    ...(root.readOnly ? [{ label: 'Read only', tone: 'neutral', icon: 'eye' } as const] : []),
  ];
}

function withReason(word: string, reason: string | null): string {
  return joinParts([word, reason]);
}

export function rootStateLineOf(root: DriveRoot): RootStateLine {
  if (root.state === 'scanning')
    return { text: 'Scanning for changes', tone: 'info', icon: 'refresh' };
  if (root.state === 'offline') {
    return { text: withReason('Offline', root.stateReason), tone: 'critical', icon: 'wifiOff' };
  }
  if (root.state === 'unresponsive') {
    return {
      text: withReason('Not answering', root.stateReason),
      tone: 'warning',
      icon: 'warning',
    };
  }
  if (root.state === 'error') {
    return {
      text: withReason('Cannot be read', root.stateReason),
      tone: 'critical',
      icon: 'warning',
    };
  }
  if (root.health.corrupt > 0) {
    return {
      text: `${plural(root.health.corrupt, 'damaged file')} found`,
      tone: 'warning',
      icon: 'warning',
    };
  }
  return { text: 'Watching for changes', tone: 'positive', icon: 'circleCheck' };
}

export function rootVolumeBarOf(
  root: DriveRoot,
  volume: DriveStatsVolume | null,
): RootVolumeBar | null {
  if (volume === null) return null;
  const usedOnVolume = volume.totalBytes - volume.freeBytes;
  const other = Math.max(0, usedOnVolume - root.bytes);
  return {
    segments: [
      { label: root.label, value: root.bytes, colour: 'primary' },
      { label: 'Other files', value: other, colour: 'track' },
    ],
    total: volume.totalBytes,
    caption: `of ${bytes(volume.totalBytes)} · ${bytes(volume.freeBytes)} free`,
  };
}

export function kindSegmentsOf(kinds: readonly DriveStatsKind[]): readonly BarSegment[] {
  return kinds
    .filter((kind) => kind.bytes > 0)
    .map((kind) => ({
      label: KIND_LABEL[kind.kind],
      value: kind.bytes,
      colour: KIND_COLOUR[kind.kind],
    }));
}

export function itemsTextOf(items: number): string {
  return `${count(items)} ${items === 1 ? 'file' : 'files'}`;
}

export function rootCardOf(
  root: DriveRoot,
  volume: DriveStatsVolume | null,
  kinds: readonly DriveStatsKind[],
): RootCardModel {
  return {
    glyph: GLYPH[root.kind],
    ...subtitleOf(root),
    badges: rootBadgesOf(root),
    used: `${bytes(root.bytes)} used`,
    volume: rootVolumeBarOf(root, volume),
    kinds: kindSegmentsOf(kinds),
    items: itemsTextOf(root.items),
    state: rootStateLineOf(root),
  };
}

export function rootVolumeOf(
  volumes: readonly DriveStatsVolume[],
  rootId: string,
): DriveStatsVolume | null {
  return volumes.find((volume) => volume.rootIds.includes(rootId)) ?? null;
}
