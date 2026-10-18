import {
  formatBytes,
  formatByteRate,
  type SyncActivity,
  type SyncthingFolder,
  type SyncthingPeer,
  type SyncthingSnapshot,
} from '@smarteverything/domain';
import { plural } from '../../../format/text';
import { moment } from '../../../format/time';
import type { CellChip } from '../../shared/cell-parts';
import type { MedallionTone } from '../../shared/medallion-model';
import { SYNC_STATE_TEXT } from '../syncthing-data';
import { staleOf } from '../widgets/sync-model';
import { folderState, orderedFolders, type FolderState } from './folder-model';
import { heroOf } from './hero-model';

type SyncCellKind =
  'synced' | 'syncing' | 'paused' | 'error' | 'offline' | 'empty' | 'stale';

export interface CellFolder {
  readonly id: string;
  readonly label: string;
  readonly state: FolderState;
}

export interface CellPeer {
  readonly id: string;
  readonly name: string;
  readonly online: boolean;
}

interface CellRate {
  readonly value: string;
  readonly unit: string;
  readonly caption: string;
}

export interface SyncCell {
  readonly kind: SyncCellKind;
  readonly chip: CellChip;
  readonly tone: MedallionTone;
  readonly ratio: number | null;
  readonly line: string;
  readonly rates: readonly CellRate[];
  readonly folders: readonly CellFolder[];
  readonly peers: readonly CellPeer[];
  readonly problem: CellFolder | null;
  readonly paused: boolean;
  readonly canAct: boolean;
  readonly spoken: string;
  readonly reason: string | null;
}

const RING_FOLDERS = 3;
const MAX_PEERS = 6;

const KIND_OF: Readonly<Record<SyncthingSnapshot['summary']['state'], SyncCellKind>> = {
  in_sync: 'synced',
  syncing: 'syncing',
  paused: 'paused',
  error: 'error',
  offline: 'offline',
  empty: 'empty',
};

function folderOf(folder: SyncthingFolder): CellFolder {
  return { id: folder.id, label: folder.label, state: folderState(folder) };
}

function peerOf(peer: SyncthingPeer): CellPeer {
  return { id: peer.id, name: peer.name, online: peer.connected && !peer.paused };
}

function splitRate(bytesPerSecond: number): { readonly value: string; readonly unit: string } {
  const text = formatByteRate(bytesPerSecond);
  const space = text.lastIndexOf(' ');
  return { value: text.slice(0, space), unit: text.slice(space + 1) };
}

function devicesLine(summary: SyncthingSnapshot['summary']): string {
  if (summary.peersTotal === 0) {
    return 'No other devices';
  }
  return summary.peersOnline === 0
    ? 'No other devices online'
    : `${String(summary.peersOnline)} of ${plural(summary.peersTotal, 'device')} online`;
}

function lineOf(
  snapshot: SyncthingSnapshot,
  kind: SyncCellKind,
  problem: CellFolder | null,
): string {
  const { summary, folders } = snapshot;
  switch (kind) {
    case 'syncing':
      return [
        summary.needBytes > 0 ? `${formatBytes(summary.needBytes)} left` : null,
        devicesLine(summary),
      ]
        .filter((part) => part !== null)
        .join(' · ');
    case 'synced':
      return `${plural(folders.length, 'folder')} · ${devicesLine(summary)}`;
    case 'paused':
      return 'Syncing is paused on this computer';
    case 'error':
      return problem === null ? devicesLine(summary) : `${problem.state.text} in ${problem.label}`;
    case 'empty':
      return 'Share a folder in Syncthing to start';
    case 'offline':
    case 'stale':
      return 'Not connected';
  }
}

function staleCell(snapshot: SyncthingSnapshot, now: number): SyncCell {
  const caption = staleOf(snapshot.connection, now);
  const line = caption?.long ?? 'Not connected';
  const connecting = snapshot.connection.state === 'connecting';
  const chip: CellChip = connecting
    ? { tone: 'info', label: 'Connecting…' }
    : { tone: 'neutral', label: 'Not reachable' };
  return {
    kind: 'stale',
    chip,
    tone: 'neutral',
    ratio: null,
    line,
    rates: [],
    folders: orderedFolders(snapshot.folders).slice(0, RING_FOLDERS).map(folderOf),
    peers: [],
    problem: null,
    paused: false,
    canAct: false,
    spoken: `Syncthing, ${chip.label.toLowerCase()}, ${line}`,
    reason: line,
  };
}

function ratesOf(snapshot: SyncthingSnapshot, kind: SyncCellKind): readonly CellRate[] {
  const { summary, ratesLive } = snapshot;
  if (kind !== 'syncing' || !ratesLive) {
    return [];
  }
  return [
    { ...splitRate(summary.downloadBytesPerSecond), caption: '↓ in' },
    { ...splitRate(summary.uploadBytesPerSecond), caption: '↑ out' },
  ];
}

export function syncCellOf(snapshot: SyncthingSnapshot, now: number): SyncCell {
  if (snapshot.connection.state !== 'online') {
    return staleCell(snapshot, now);
  }
  const hero = heroOf(snapshot);
  const kind = KIND_OF[snapshot.summary.state];
  const ordered = orderedFolders(snapshot.folders).map(folderOf);
  const problem = ordered.find((folder) => folder.state.tone === 'critical') ?? null;
  const label =
    kind === 'error' && problem !== null
      ? plural(ordered.filter((folder) => folder.state.tone === 'critical').length, 'conflict')
      : SYNC_STATE_TEXT[snapshot.summary.state].title;
  const chip: CellChip = { tone: hero.tone, label };
  const line = lineOf(snapshot, kind, problem);
  return {
    kind,
    chip,
    tone: hero.tone,
    ratio: hero.ratio,
    line,
    rates: ratesOf(snapshot, kind),
    folders: ordered.slice(0, RING_FOLDERS),
    peers: snapshot.peers.slice(0, MAX_PEERS).map(peerOf),
    problem,
    paused: kind === 'paused',
    canAct: hero.canAct,
    spoken: `Syncthing, ${chip.label.toLowerCase()}, ${line}`,
    reason: null,
  };
}

export function lastFileLine(activity: readonly SyncActivity[], now: number): string | null {
  const changes = activity.filter(
    (item) => item.path !== null && (item.kind === 'added' || item.kind === 'modified'),
  );
  const newest = changes.reduce<SyncActivity | null>(
    (best, item) => (best === null || item.at > best.at ? item : best),
    null,
  );
  const path = newest?.path;
  if (newest === null || path === null || path === undefined) {
    return null;
  }
  return `${path.split('/').at(-1) ?? path} · ${moment(newest.at, now)}`;
}
