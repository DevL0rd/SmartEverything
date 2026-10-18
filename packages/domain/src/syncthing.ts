import { z } from 'zod';

const MOMENT = z.iso.datetime({ offset: true });

const SYNCTHING_DEVICE_ID = z
  .string()
  .regex(/^[A-Z2-7]{7}(-[A-Z2-7]{7}){7}$/, 'a Syncthing device ID');

const FOLDER_ID = z.string().min(1);

export const SYNC_STATES = ['in_sync', 'syncing', 'paused', 'error', 'offline', 'empty'] as const;

export type SyncState = (typeof SYNC_STATES)[number];

const SYNCTHING_CONNECTION = z.discriminatedUnion('state', [
  z.object({ state: z.literal('not_set_up') }),
  z.object({ state: z.literal('connecting') }),
  z.object({ state: z.literal('online') }),
  z.object({ state: z.literal('key_rejected') }),
  z.object({ state: z.literal('unreachable'), reason: z.string(), since: MOMENT }),
]);

export const FOLDER_TYPES = ['sendreceive', 'sendonly', 'receiveonly', 'receiveencrypted'] as const;

const LAST_FILE = z.object({ name: z.string(), at: MOMENT, deleted: z.boolean() });

const SYNCTHING_FOLDER = z.object({
  id: FOLDER_ID,
  label: z.string(),
  path: z.string(),
  type: z.enum(FOLDER_TYPES),
  paused: z.boolean(),
  state: z.string(),
  completionPercent: z.number().min(0).max(100),
  needBytes: z.number().nonnegative(),
  needItems: z.number().int().nonnegative(),
  localChanges: z.number().int().nonnegative(),
  errors: z.array(z.object({ path: z.string(), error: z.string() })),
  errorCount: z.number().int().nonnegative(),
  stateError: z.string().nullable(),
  sharedWith: z.array(SYNCTHING_DEVICE_ID),
  lastScan: MOMENT.nullable(),
  lastFile: LAST_FILE.nullable(),
});

export type SyncthingFolder = z.output<typeof SYNCTHING_FOLDER>;

const SYNCTHING_PEER = z.object({
  id: SYNCTHING_DEVICE_ID,
  name: z.string(),
  connected: z.boolean(),
  paused: z.boolean(),
  address: z.string().nullable(),
  clientVersion: z.string().nullable(),
  completionPercent: z.number().min(0).max(100),
  needBytes: z.number().nonnegative(),
  inBytesPerSecond: z.number().nonnegative(),
  outBytesPerSecond: z.number().nonnegative(),
  lastSeen: MOMENT.nullable(),
  overdue: z.boolean(),
});

export type SyncthingPeer = z.output<typeof SYNCTHING_PEER>;

const PENDING_DEVICE = z.object({
  id: SYNCTHING_DEVICE_ID,
  name: z.string(),
  address: z.string().nullable(),
  at: MOMENT,
});

const PENDING_FOLDER = z.object({
  id: FOLDER_ID,
  label: z.string(),
  offeredBy: z.array(z.object({ id: SYNCTHING_DEVICE_ID, name: z.string(), at: MOMENT })),
  encrypted: z.boolean(),
});

const SYNC_ATTENTION_KINDS = [
  'folder_error',
  'file_errors',
  'device_overdue',
  'system_error',
] as const;

const SYNC_ATTENTION = z.object({
  kind: z.enum(SYNC_ATTENTION_KINDS),
  text: z.string(),
  folderId: FOLDER_ID.nullable(),
  deviceId: SYNCTHING_DEVICE_ID.nullable(),
});

export type SyncAttention = z.output<typeof SYNC_ATTENTION>;

const SYNC_SUMMARY = z.object({
  state: z.enum(SYNC_STATES),
  needBytes: z.number().nonnegative(),
  foldersBehind: z.number().int().nonnegative(),
  peersOnline: z.number().int().nonnegative(),
  peersTotal: z.number().int().nonnegative(),
  downloadBytesPerSecond: z.number().nonnegative(),
  uploadBytesPerSecond: z.number().nonnegative(),
});

export const SYNCTHING_SNAPSHOT = z.object({
  at: MOMENT,
  connection: SYNCTHING_CONNECTION,
  version: z.string().nullable(),
  myId: SYNCTHING_DEVICE_ID.nullable(),
  uptimeSeconds: z.number().nonnegative().nullable(),
  ratesLive: z.boolean(),
  summary: SYNC_SUMMARY,
  folders: z.array(SYNCTHING_FOLDER),
  peers: z.array(SYNCTHING_PEER),
  pendingDevices: z.array(PENDING_DEVICE),
  pendingFolders: z.array(PENDING_FOLDER),
  attention: z.array(SYNC_ATTENTION),
});

export type SyncthingSnapshot = z.output<typeof SYNCTHING_SNAPSHOT>;

const SYNC_ACTIVITY_KINDS = [
  'added',
  'modified',
  'deleted',
  'connected',
  'disconnected',
  'paused',
  'resumed',
  'error',
] as const;

export const SYNC_ACTIVITY = z.object({
  id: z.number().int().nonnegative(),
  at: MOMENT,
  kind: z.enum(SYNC_ACTIVITY_KINDS),
  folderId: FOLDER_ID.nullable(),
  path: z.string().nullable(),
  deviceId: SYNCTHING_DEVICE_ID.nullable(),
  remote: z.boolean(),
});

export type SyncActivity = z.output<typeof SYNC_ACTIVITY>;

const SYNC_TARGET = z.discriminatedUnion('kind', [
  z.strictObject({ kind: z.literal('all') }),
  z.strictObject({ kind: z.literal('folder'), id: FOLDER_ID }),
  z.strictObject({ kind: z.literal('device'), id: SYNCTHING_DEVICE_ID }),
]);

export type SyncTarget = z.output<typeof SYNC_TARGET>;

const FOLDER_COMMAND = { folderId: FOLDER_ID };

export const SYNC_PAUSE_COMMAND = z.strictObject({
  command: z.literal('set_paused'),
  target: SYNC_TARGET,
  paused: z.boolean(),
});

export const SYNC_RESCAN_COMMAND = z.strictObject({
  command: z.literal('rescan'),
  folderId: FOLDER_ID.nullable(),
});

export const SYNC_RESOLVE_COMMAND = z.strictObject({
  command: z.enum(['override', 'revert']),
  ...FOLDER_COMMAND,
});

export const SYNC_ACCEPT_COMMAND = z.discriminatedUnion('command', [
  z.strictObject({
    command: z.literal('accept_device'),
    deviceId: SYNCTHING_DEVICE_ID,
    name: z.string().trim().min(1).max(80),
  }),
  z.strictObject({
    command: z.literal('accept_folder'),
    ...FOLDER_COMMAND,
    path: z.string().trim().min(1).max(1000).nullable(),
  }),
]);

export const SYNC_IGNORE_COMMAND = z.discriminatedUnion('command', [
  z.strictObject({ command: z.literal('ignore_device'), deviceId: SYNCTHING_DEVICE_ID }),
  z.strictObject({ command: z.literal('ignore_folder'), ...FOLDER_COMMAND }),
]);

export const SYNCTHING_COMMAND = z.union([
  SYNC_PAUSE_COMMAND,
  SYNC_RESCAN_COMMAND,
  SYNC_RESOLVE_COMMAND,
  SYNC_ACCEPT_COMMAND,
  SYNC_IGNORE_COMMAND,
]);

export type SyncthingCommand = z.output<typeof SYNCTHING_COMMAND>;
