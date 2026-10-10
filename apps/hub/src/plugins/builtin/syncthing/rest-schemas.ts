import { FOLDER_TYPES } from '@smarteverything/domain';
import { z } from 'zod';

const COUNT = z.number().nonnegative().catch(0);
const TEXT = z.string().default('');
const STAMP = z.string().nullable().default(null);

export const CONFIG_FOLDER = z.looseObject({
  id: z.string().min(1),
  label: TEXT,
  path: TEXT,
  type: z.enum(FOLDER_TYPES),
  paused: z.boolean(),
  devices: z.array(z.looseObject({ deviceID: z.string() })).default([]),
});

export type ConfigFolder = z.output<typeof CONFIG_FOLDER>;

export const CONFIG_DEVICE = z.looseObject({
  deviceID: z.string(),
  name: TEXT,
  paused: z.boolean(),
  ignoredFolders: z.array(z.looseObject({ id: z.string() })).default([]),
});

export type ConfigDevice = z.output<typeof CONFIG_DEVICE>;

export const SYSTEM_STATUS = z.looseObject({ myID: z.string(), uptime: COUNT });

export const SYSTEM_VERSION = z.looseObject({ version: z.string() });

export const FOLDER_SUMMARY = z.looseObject({
  state: TEXT,
  error: TEXT,
  globalBytes: COUNT,
  needBytes: COUNT,
  needTotalItems: COUNT,
  receiveOnlyChangedFiles: COUNT,
  pullErrors: COUNT,
});

export type FolderSummary = z.output<typeof FOLDER_SUMMARY>;

export const FOLDER_SUMMARY_EVENT = z.looseObject({
  folder: z.string().min(1),
  summary: FOLDER_SUMMARY,
});

export const FOLDER_ERRORS = z.looseObject({
  errors: z
    .array(z.looseObject({ path: TEXT, error: TEXT }))
    .nullable()
    .transform((errors) => errors ?? []),
});

const CONNECTION = z.looseObject({
  connected: z.boolean(),
  paused: z.boolean().default(false),
  address: TEXT,
  clientVersion: TEXT,
  inBytesTotal: COUNT,
  outBytesTotal: COUNT,
});

export type Connection = z.output<typeof CONNECTION>;

export const CONNECTIONS = z.looseObject({
  connections: z.record(z.string(), CONNECTION),
  total: z.looseObject({ inBytesTotal: COUNT, outBytesTotal: COUNT }),
});

export type Connections = z.output<typeof CONNECTIONS>;

export const COMPLETION = z.looseObject({
  completion: z.number().min(0).max(100).catch(100),
  needBytes: COUNT,
  needItems: COUNT,
  needDeletes: COUNT,
});

export type Completion = z.output<typeof COMPLETION>;

export const DEVICE_STATS = z.record(z.string(), z.looseObject({ lastSeen: STAMP }));

export const FOLDER_STATS = z.record(
  z.string(),
  z.looseObject({
    lastScan: STAMP,
    lastFile: z
      .looseObject({ filename: TEXT, at: STAMP, deleted: z.boolean().default(false) })
      .nullable()
      .default(null),
  }),
);

export const SYSTEM_ERRORS = z.looseObject({
  errors: z
    .array(z.looseObject({ when: STAMP, message: TEXT }))
    .nullable()
    .transform((errors) => errors ?? []),
});

export const PENDING_DEVICES = z.record(
  z.string(),
  z.looseObject({ time: STAMP, name: TEXT, address: TEXT }),
);

export type PendingDevices = z.output<typeof PENDING_DEVICES>;

export const PENDING_FOLDERS = z.record(
  z.string(),
  z.looseObject({
    offeredBy: z.record(
      z.string(),
      z.looseObject({ time: STAMP, label: TEXT, receiveEncrypted: z.boolean().default(false) }),
    ),
  }),
);

export type PendingFolders = z.output<typeof PENDING_FOLDERS>;

const SYNCTHING_EVENT = z.looseObject({
  id: z.number().int().nonnegative(),
  type: z.string(),
  time: z.string(),
  data: z.unknown(),
});

export type SyncthingEvent = z.output<typeof SYNCTHING_EVENT>;

export const SYNCTHING_EVENTS = z
  .array(SYNCTHING_EVENT)
  .nullable()
  .transform((events) => events ?? []);

export const DEFAULT_FOLDER = z.looseObject({ path: TEXT });

export const DEFAULT_DEVICE = z.looseObject({});

export const IGNORED_DEVICES = z
  .array(z.looseObject({ deviceID: z.string() }))
  .nullable()
  .transform((devices) => devices ?? []);
