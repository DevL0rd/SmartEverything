import { z } from 'zod';
import { MAC_ADDRESS } from './mac-address';

const IPV4 = z.ipv4();

const ROUTER_INFO = z.strictObject({
  model: z.string().nullable(),
  firmware: z.string().nullable(),
  lanIp: z.string().nullable(),
  uptimeSeconds: z.number().nonnegative(),
});

const ROUTER_SYSTEM = z.strictObject({
  cpuPercent: z.number().min(0).max(100),
  corePercents: z.array(z.number().min(0).max(100)),
  load: z.tuple([z.number(), z.number(), z.number()]),
  memoryUsedPercent: z.number().min(0).max(100),
  memoryTotalKb: z.number().nonnegative(),
  swapUsedPercent: z.number().min(0).max(100),
  temperatureCelsius: z.number().nullable(),
  connections: z.number().int().nonnegative(),
  connectionsMax: z.number().int().nonnegative(),
});

const WIRED_PORT = z.strictObject({ port: z.string(), link: z.string() });

const ROUTER_NETWORK = z.strictObject({
  wanUp: z.boolean().nullable(),
  protocol: z.string().nullable(),
  publicIp: z.string().nullable(),
  gateway: z.string().nullable(),
  dns: z.array(z.string()),
  downloadMbps: z.number().nonnegative(),
  uploadMbps: z.number().nonnegative(),
  lanDownloadMbps: z.number().nonnegative(),
  lanUploadMbps: z.number().nonnegative(),
  latencyMs: z.number().nonnegative().nullable(),
  packetLossPercent: z.number().min(0).max(100).nullable(),
  ports: z.array(WIRED_PORT),
});

const WIFI_BAND = z.string().min(1);

const WIFI_RADIO = z.strictObject({
  band: WIFI_BAND,
  ssid: z.string().nullable(),
  enabled: z.boolean().nullable(),
  txPower: z.number().nullable(),
  channel: z.number().int().nullable(),
  width: z.string().nullable(),
  noiseDbm: z.number().nullable(),
  temperatureCelsius: z.number().nullable(),
  airtimeBusyPercent: z.number().nullable(),
  dfs: z.string().nullable(),
  clients: z.number().int().nonnegative(),
});

const WIFI_STATION = z.strictObject({
  mac: MAC_ADDRESS,
  band: WIFI_BAND,
  rssiDbm: z.number().nullable(),
  txMbps: z.number().nonnegative(),
  rxMbps: z.number().nonnegative(),
  phyMbps: z.number().nonnegative(),
  trafficBytesPerSecond: z.number().nonnegative(),
});

const NETWORK_CLIENT = z.strictObject({
  mac: MAC_ADDRESS,
  name: z.string(),
  ip: IPV4.nullable(),
  connection: z.enum(['wifi', 'wired']).nullable(),
  band: WIFI_BAND.nullable(),
  connected: z.boolean(),
  blocked: z.boolean(),
  trafficBytesPerSecond: z.number().nonnegative().nullable(),
  profileId: z.uuid().nullable().default(null),
  firstSeen: z.iso.datetime({ offset: true }).nullable().default(null),
  lastSeen: z.iso.datetime({ offset: true }).nullable().default(null),
});

export const KNOWN_CLIENT = z.strictObject({
  mac: MAC_ADDRESS,
  name: z.string(),
  profileId: z.uuid().nullable(),
  firstSeen: z.iso.datetime({ offset: true }),
  lastSeen: z.iso.datetime({ offset: true }),
  present: z.boolean(),
});

export type KnownClient = z.output<typeof KNOWN_CLIENT>;

export type NetworkClient = z.output<typeof NETWORK_CLIENT>;

const ROUTER_CONNECTION = z.discriminatedUnion('state', [
  z.strictObject({ state: z.literal('not_set_up') }),
  z.strictObject({ state: z.literal('connecting') }),
  z.strictObject({ state: z.literal('online') }),
  z.strictObject({ state: z.literal('paused') }),
  z.strictObject({
    state: z.literal('unreachable'),
    reason: z.string(),
    since: z.iso.datetime({ offset: true }),
  }),
]);

const ROUTER_CADENCE = z.enum(['fast', 'slow', 'paused']);

export const ROUTER_SNAPSHOT = z.strictObject({
  at: z.iso.datetime({ offset: true }),
  connection: ROUTER_CONNECTION,
  cadence: ROUTER_CADENCE,
  intervalSeconds: z.number().positive().nullable(),
  info: ROUTER_INFO.nullable(),
  system: ROUTER_SYSTEM.nullable(),
  network: ROUTER_NETWORK.nullable(),
  radios: z.array(WIFI_RADIO),
  stations: z.array(WIFI_STATION),
  clients: z.array(NETWORK_CLIENT),
});

export type RouterSnapshot = z.output<typeof ROUTER_SNAPSHOT>;

const DISCONNECT = z.strictObject({ action: z.literal('disconnect'), mac: MAC_ADDRESS });
const BLOCK = z.strictObject({ action: z.literal('block'), mac: MAC_ADDRESS });
const UNBLOCK = z.strictObject({ action: z.literal('unblock'), mac: MAC_ADDRESS });
const RENAME = z.strictObject({
  action: z.literal('rename'),
  mac: MAC_ADDRESS,
  name: z
    .string()
    .trim()
    .min(1)
    .max(32)
    .regex(/^[^<>]+$/),
});
const RESERVE = z.strictObject({ action: z.literal('reserve'), mac: MAC_ADDRESS, ip: IPV4 });

export const ROUTER_CLIENT_CUTOFF = z.discriminatedUnion('action', [DISCONNECT, BLOCK]);

export const ROUTER_CLIENT_UPDATE = z.discriminatedUnion('action', [UNBLOCK, RENAME, RESERVE]);

const ROUTER_CLIENT_ACTION = z.discriminatedUnion('action', [
  DISCONNECT,
  BLOCK,
  UNBLOCK,
  RENAME,
  RESERVE,
]);

export type RouterClientAction = z.output<typeof ROUTER_CLIENT_ACTION>;

export const ROUTER_COMMAND = z.discriminatedUnion('command', [
  z.strictObject({ command: z.literal('reboot') }),
  z.strictObject({ command: z.literal('restart_wifi') }),
  z.strictObject({ command: z.literal('client'), client: ROUTER_CLIENT_ACTION }),
]);

export type RouterCommand = z.output<typeof ROUTER_COMMAND>;

const SPEED_TEST_PHASE = z.enum(['ping', 'download', 'upload', 'done', 'failed']);

export const SPEED_TEST_PROGRESS = z.strictObject({
  phase: SPEED_TEST_PHASE,
  mbps: z.number().nonnegative(),
  pingMs: z.number().nonnegative().nullable(),
  downloadMbps: z.number().nonnegative().nullable(),
  reason: z.string().nullable(),
});

export type SpeedTestProgress = z.output<typeof SPEED_TEST_PROGRESS>;

export const SPEED_TEST_RESULT = z.strictObject({
  id: z.uuid(),
  at: z.iso.datetime({ offset: true }),
  server: z.string(),
  downloadMbps: z.number().nonnegative(),
  uploadMbps: z.number().nonnegative(),
  pingMs: z.number().nonnegative(),
  jitterMs: z.number().nonnegative(),
  packetLossPercent: z.number().min(0).max(100),
});

export type SpeedTestResult = z.output<typeof SPEED_TEST_RESULT>;
