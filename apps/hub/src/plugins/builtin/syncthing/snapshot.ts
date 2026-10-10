import type {
  SyncAttention,
  SyncState,
  SyncthingFolder,
  SyncthingPeer,
  SyncthingSnapshot,
} from '@smarteverything/domain';
import type { ConfigDevice, ConfigFolder, Connection, FolderSummary } from './rest-schemas';
import type { FolderStats, SyncData } from './sync-data';
import type { TransferRates } from './transfer-rates';

interface SnapshotInput {
  readonly data: SyncData;
  readonly rates: TransferRates;
  readonly ratesLive: boolean;
  readonly connection: SyncthingSnapshot['connection'];
  readonly overdueHours: number;
  readonly now: Date;
}

const ERRORS_KEPT = 20;

function moment(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) || parsed.getUTCFullYear() < 1971
    ? null
    : parsed.toISOString();
}

type FolderProgress = Pick<
  SyncthingFolder,
  'state' | 'completionPercent' | 'needBytes' | 'needItems' | 'localChanges' | 'stateError'
> & { readonly pullErrors: number };

function progressOf(summary: FolderSummary | undefined, paused: boolean): FolderProgress {
  if (summary === undefined) {
    const state = paused ? 'paused' : 'unknown';
    return {
      state,
      completionPercent: 100,
      needBytes: 0,
      needItems: 0,
      localChanges: 0,
      stateError: null,
      pullErrors: 0,
    };
  }
  const { globalBytes, needBytes } = summary;
  return {
    state: paused ? 'paused' : summary.state,
    completionPercent:
      globalBytes > 0
        ? Math.max(0, Math.min(100, ((globalBytes - needBytes) / globalBytes) * 100))
        : 100,
    needBytes,
    needItems: summary.needTotalItems,
    localChanges: summary.receiveOnlyChangedFiles,
    stateError: summary.error.length > 0 ? summary.error : null,
    pullErrors: summary.pullErrors,
  };
}

function lastFileOf(stats: FolderStats[string] | undefined): SyncthingFolder['lastFile'] {
  const file = stats?.lastFile ?? null;
  const at = moment(file?.at ?? null);
  return file === null || at === null || file.filename.length === 0
    ? null
    : { name: file.filename, at, deleted: file.deleted };
}

function folderOf(input: SnapshotInput, config: ConfigFolder): SyncthingFolder {
  const errors = input.data.folderErrors.get(config.id) ?? [];
  const stats = input.data.folderStats[config.id];
  const { pullErrors, ...progress } = progressOf(
    input.data.summaries.get(config.id),
    config.paused,
  );
  return {
    id: config.id,
    label: config.label.length > 0 ? config.label : config.id,
    path: config.path,
    type: config.type,
    paused: config.paused,
    ...progress,
    errors: errors.slice(0, ERRORS_KEPT),
    errorCount: Math.max(errors.length, pullErrors),
    sharedWith: config.devices
      .map((device) => device.deviceID)
      .filter((device) => device !== input.data.myId),
    lastScan: moment(stats?.lastScan ?? null),
    lastFile: lastFileOf(stats),
  };
}

function isOverdue(
  input: SnapshotInput,
  lastSeen: string | null,
  connected: boolean,
  paused: boolean,
): boolean {
  if (paused || connected || input.overdueHours <= 0 || lastSeen === null) {
    return false;
  }
  return input.now.getTime() - new Date(lastSeen).getTime() >= input.overdueHours * 3_600_000;
}

function linkOf(
  connection: Connection | undefined,
): Pick<SyncthingPeer, 'connected' | 'address' | 'clientVersion'> {
  if (connection?.connected !== true) {
    return { connected: false, address: null, clientVersion: null };
  }
  return {
    connected: true,
    address: connection.address.length > 0 ? connection.address : null,
    clientVersion: connection.clientVersion.length > 0 ? connection.clientVersion : null,
  };
}

function peerOf(input: SnapshotInput, config: ConfigDevice): SyncthingPeer {
  const id = config.deviceID;
  const link = linkOf(input.data.connections?.connections[id]);
  const completion = input.data.completion.get(id);
  const lastSeen = moment(input.data.deviceStats[id]?.lastSeen ?? null);
  const rate = input.rates.device(id);
  return {
    id,
    name: config.name.length > 0 ? config.name : id.slice(0, 7),
    ...link,
    paused: config.paused,
    completionPercent: completion === undefined ? 100 : completion.completion,
    needBytes: completion === undefined ? 0 : completion.needBytes,
    inBytesPerSecond: rate.inBytesPerSecond,
    outBytesPerSecond: rate.outBytesPerSecond,
    lastSeen,
    overdue: isOverdue(input, lastSeen, link.connected, config.paused),
  };
}

function syncStateOf(
  connection: SyncthingSnapshot['connection'],
  folders: readonly SyncthingFolder[],
  peers: readonly SyncthingPeer[],
): SyncState {
  if (connection.state !== 'online') {
    return 'offline';
  }
  if (folders.length === 0) {
    return 'empty';
  }
  if (
    folders.every((folder) => folder.paused) ||
    (peers.length > 0 && peers.every((peer) => peer.paused))
  ) {
    return 'paused';
  }
  if (folders.some((folder) => folder.state === 'error' || folder.errorCount > 0)) {
    return 'error';
  }
  const busy = folders.some(
    (folder) =>
      !folder.paused &&
      (folder.needItems > 0 || folder.state.startsWith('sync') || folder.state === 'scanning'),
  );
  return busy ? 'syncing' : 'in_sync';
}

export function buildSnapshot(input: SnapshotInput): SyncthingSnapshot {
  const folders = input.data.folders.map((folder) => folderOf(input, folder));
  const peers = input.data.devices.map((device) => peerOf(input, device));
  const total = input.rates.total;
  return {
    at: input.now.toISOString(),
    connection: input.connection,
    version: input.data.version,
    myId: input.data.myId,
    uptimeSeconds: input.data.uptimeSeconds,
    ratesLive: input.ratesLive,
    summary: {
      state: syncStateOf(input.connection, folders, peers),
      needBytes: folders.reduce((sum, folder) => sum + folder.needBytes, 0),
      foldersBehind: folders.filter((folder) => !folder.paused && folder.completionPercent < 100)
        .length,
      peersOnline: peers.filter((peer) => peer.connected).length,
      peersTotal: peers.length,
      downloadBytesPerSecond: total.inBytesPerSecond,
      uploadBytesPerSecond: total.outBytesPerSecond,
    },
    folders,
    peers,
    ...pendingOf(input),
    attention: attentionOf(input, folders, peers),
  };
}

function nameOf(input: SnapshotInput, id: string): string {
  const device = input.data.devices.find((candidate) => candidate.deviceID === id);
  return device !== undefined && device.name.length > 0 ? device.name : id.slice(0, 7);
}

function pendingOf(
  input: SnapshotInput,
): Pick<SyncthingSnapshot, 'pendingDevices' | 'pendingFolders'> {
  const fallback = input.now.toISOString();
  return {
    pendingDevices: Object.entries(input.data.pendingDevices).map(([id, device]) => ({
      id,
      name: device.name.length > 0 ? device.name : id.slice(0, 7),
      address: device.address.length > 0 ? device.address : null,
      at: moment(device.time) ?? fallback,
    })),
    pendingFolders: Object.entries(input.data.pendingFolders).map(([id, folder]) => {
      const offers = Object.entries(folder.offeredBy);
      return {
        id,
        label: offers.find(([, offer]) => offer.label.length > 0)?.[1].label ?? id,
        offeredBy: offers.map(([device, offer]) => ({
          id: device,
          name: nameOf(input, device),
          at: moment(offer.time) ?? fallback,
        })),
        encrypted: offers.some(([, offer]) => offer.receiveEncrypted),
      };
    }),
  };
}

function attentionOf(
  input: SnapshotInput,
  folders: readonly SyncthingFolder[],
  peers: readonly SyncthingPeer[],
): SyncAttention[] {
  const none = { folderId: null, deviceId: null };
  return [
    ...folders.flatMap((folder): SyncAttention[] => {
      if (folder.stateError !== null) {
        return [
          {
            ...none,
            kind: 'folder_error',
            text: `${folder.label}: ${folder.stateError}`,
            folderId: folder.id,
          },
        ];
      }
      return folder.errorCount > 0
        ? [
            {
              ...none,
              kind: 'file_errors',
              text: `${folder.label}: ${String(folder.errorCount)} files failed`,
              folderId: folder.id,
            },
          ]
        : [];
    }),
    ...peers
      .filter((peer) => peer.overdue)
      .map((peer): SyncAttention => ({
        ...none,
        kind: 'device_overdue',
        text: `${peer.name} has been away a while`,
        deviceId: peer.id,
      })),
    ...input.data.systemErrors.map((error): SyncAttention => ({
      ...none,
      kind: 'system_error',
      text: error.message,
    })),
  ];
}
