import type { SyncthingFolder, SyncthingPeer, SyncthingSnapshot } from '@smarteverything/domain';

const ID = 'AAAAAAA-BBBBBBB-CCCCCCC-DDDDDDD-EEEEEEE-FFFFFFF-GGGGGGG-HHHHHHH';
const NOW = '2026-10-17T10:00:00+07:00';

export function folderOf(overrides: Partial<SyncthingFolder> = {}): SyncthingFolder {
  return {
    id: 'photos',
    label: 'Photos',
    path: '/home/dana/Photos',
    type: 'sendreceive',
    paused: false,
    state: 'idle',
    completionPercent: 100,
    needBytes: 0,
    needItems: 0,
    localChanges: 0,
    errors: [],
    errorCount: 0,
    stateError: null,
    sharedWith: [],
    lastScan: null,
    lastFile: null,
    ...overrides,
  };
}

export function peerOf(overrides: Partial<SyncthingPeer> = {}): SyncthingPeer {
  return {
    id: ID,
    name: 'NAS',
    connected: true,
    paused: false,
    address: null,
    clientVersion: null,
    completionPercent: 100,
    needBytes: 0,
    inBytesPerSecond: 0,
    outBytesPerSecond: 0,
    lastSeen: null,
    overdue: false,
    ...overrides,
  };
}

export function snapshotOf(overrides: Partial<SyncthingSnapshot> = {}): SyncthingSnapshot {
  return {
    at: NOW,
    connection: { state: 'online' },
    version: 'v1.29.2',
    myId: ID,
    uptimeSeconds: 3600,
    ratesLive: true,
    summary: {
      state: 'in_sync',
      needBytes: 0,
      foldersBehind: 0,
      peersOnline: 1,
      peersTotal: 1,
      downloadBytesPerSecond: 0,
      uploadBytesPerSecond: 0,
    },
    folders: [folderOf()],
    peers: [peerOf()],
    pendingDevices: [],
    pendingFolders: [],
    attention: [],
    ...overrides,
  };
}
