import { z } from 'zod';
import { AUDIO_STATE } from './computer-audio';
import { DISPLAY_STATE } from './computer-displays';
import { PROCESS_WINDOW, PROCESSES_PART, PROCESSES_UPDATE } from './computer-processes';
import { COMPUTER_SESSION } from './computer-session-state';
import {
  CPU_PART,
  DISKS_PART,
  GPU_PART,
  MEMORY_PART,
  NETWORK_PART,
  POWER_PART,
  SENSORS_PART,
  COMPUTER_SUMMARY,
} from './computer-snapshot';
import { SERVICES_STATE, SYSTEM_STATE } from './computer-system';
import { TILING_STATE } from './computer-tiling';
import { WINDOWS_STATE } from './computer-windows';
import { HISTORY_POLICY } from '../history-settings';

const DEVICE_ID = z.uuid();

export const SAMPLE_TOPICS = [
  'summary',
  'cpu',
  'gpu',
  'memory',
  'disks',
  'network',
  'sensors',
  'power',
  'processes',
] as const;

export const STATE_TOPICS = [
  'audio',
  'displays',
  'system',
  'windows',
  'tiling',
  'services',
] as const;

export const COMPUTER_TOPICS = [...SAMPLE_TOPICS, ...STATE_TOPICS] as const;

export type ComputerTopic = (typeof COMPUTER_TOPICS)[number];

export const WATCH_TOPICS = [...COMPUTER_TOPICS, 'live'] as const;

export type WatchTopic = (typeof WATCH_TOPICS)[number];

export const LIVE_INTERVAL_MS = 1000;

export const SUMMARY_IDLE_INTERVAL_MS = 10_000;

export const SLOW_SENSOR_WATCHED_INTERVAL_MS = 10_000;

export const SLOW_SENSOR_IDLE_INTERVAL_MS = 60_000;

export const DISK_SPACE_INTERVAL_MS = 10_000;

export const DISK_SPACE_IDLE_INTERVAL_MS = 60_000;

export const KEY_FRAME_INTERVAL_MS = 30_000;

export const WATCH_DEBOUNCE_MS = 200;

export const SOCKET_BACK_PRESSURE_BYTES = 64 * 1024;

export const NODE_DEMAND_TOPICS = z.partialRecord(z.enum(COMPUTER_TOPICS), z.int().positive());

export type NodeDemandTopics = z.infer<typeof NODE_DEMAND_TOPICS>;

export const NODE_DEMAND = z.strictObject({
  topics: NODE_DEMAND_TOPICS,
  processes: PROCESS_WINDOW.optional(),
  history: HISTORY_POLICY.optional(),
});

export type NodeDemand = z.infer<typeof NODE_DEMAND>;

export const WATCH_DEMAND = z.strictObject({
  deviceId: DEVICE_ID,
  topics: z.array(z.enum(WATCH_TOPICS)).min(1),
  processes: PROCESS_WINDOW.optional(),
});

export type WatchDemand = z.infer<typeof WATCH_DEMAND>;

export const WATCH_MESSAGE = z.strictObject({
  type: z.literal('watch'),
  demands: z.array(WATCH_DEMAND),
});

export type WatchMessage = z.infer<typeof WATCH_MESSAGE>;

export const SAMPLE_PARTS = z.strictObject({
  summary: COMPUTER_SUMMARY.optional(),
  cpu: CPU_PART.optional(),
  gpu: GPU_PART.optional(),
  memory: MEMORY_PART.optional(),
  disks: DISKS_PART.optional(),
  network: NETWORK_PART.optional(),
  sensors: SENSORS_PART.optional(),
  power: POWER_PART.optional(),
  processes: PROCESSES_UPDATE.optional(),
});

export type SampleParts = z.infer<typeof SAMPLE_PARTS>;

export const STATE_PARTS = z.strictObject({
  audio: AUDIO_STATE.optional(),
  displays: DISPLAY_STATE.optional(),
  system: SYSTEM_STATE.optional(),
  windows: WINDOWS_STATE.optional(),
  tiling: TILING_STATE.optional(),
  services: SERVICES_STATE.optional(),
  session: COMPUTER_SESSION.optional(),
});

export type StateParts = z.infer<typeof STATE_PARTS>;

export const COMPUTER_PARTS_UPDATE = z.strictObject({
  ...SAMPLE_PARTS.shape,
  ...STATE_PARTS.shape,
});

export type ComputerPartsUpdate = z.infer<typeof COMPUTER_PARTS_UPDATE>;

export const COMPUTER_PARTS = z.strictObject({
  ...COMPUTER_PARTS_UPDATE.shape,
  processes: PROCESSES_PART.optional(),
});

export type ComputerParts = z.infer<typeof COMPUTER_PARTS>;

export type ComputerPartName = keyof ComputerParts;

export const COMPUTER_LIVE_NOTICE = z.strictObject({
  type: z.literal('computer_live'),
  deviceId: DEVICE_ID,
  at: z.iso.datetime({ offset: true }),
  parts: COMPUTER_PARTS_UPDATE,
});

export type ComputerLiveNotice = z.infer<typeof COMPUTER_LIVE_NOTICE>;
