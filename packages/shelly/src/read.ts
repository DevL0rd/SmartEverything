import { z } from 'zod';
import { SHELLY_PAGE } from './pages';
import { SHELLY_COMPONENT_ID, SHELLY_COMPONENT_KEY, SHELLY_REVISION } from './primitives';
import { SHELLY_RESOURCES } from './read-resources';
import {
  SHELLY_LIGHT_SETTINGS,
  SHELLY_PRESENCE_SETTINGS,
  SHELLY_ZONE_SETTINGS,
} from './settings-presence';

export const SHELLY_DEVICE_INFO = z.looseObject({
  id: z.string().min(1),
  mac: z.string(),
  model: z.string(),
  gen: z.number(),
  fw_id: z.string(),
  ver: z.string(),
  app: z.string(),
  auth_en: z.boolean(),
  auth_domain: z.string().nullable().optional(),
  profile: z.string().optional(),
  provision: z.string().optional(),
});
export const SHELLY_PRESENCE_STATUS = z.looseObject({
  sensor_ver: z.string().optional(),
  live_track: z
    .looseObject({
      timer_started_at: z.number(),
      timer_duration: z.number(),
      interval: z.number(),
    })
    .nullable()
    .optional(),
  errors: z.array(z.string()).optional(),
});
export const SHELLY_ZONE_STATUS = z.looseObject({
  id: SHELLY_COMPONENT_ID,
  value: z.boolean().nullable(),
  num_objects: z.number().nullable(),
});
export const SHELLY_LIGHT_STATUS = z.looseObject({
  id: SHELLY_COMPONENT_ID,
  lux: z.number().nullable().optional(),
  illumination: z.string().nullable(),
  errors: z.array(z.string()).optional(),
});
export const SHELLY_TRACK = z.looseObject({
  id: z.number(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  minz: z.number().optional(),
  maxz: z.number().optional(),
});
export type ShellyTrack = z.output<typeof SHELLY_TRACK>;

export const SHELLY_COMPONENT = z.looseObject({
  component: z.string(),
  key: SHELLY_COMPONENT_KEY,
  config: z.looseObject({}),
  status: z.looseObject({}).nullable(),
});
export const SHELLY_CONNECTION = z.object({
  state: z.enum(['connecting', 'online', 'offline', 'needs_auth', 'paused']),
  reason: z.string().nullable(),
});
export const SHELLY_FEATURE = z.object({
  id: z.string(),
  page: SHELLY_PAGE,
  available: z.boolean(),
  reason: z.string().nullable(),
});
export const SHELLY_DISCOVERED_BTHOME = z.looseObject({
  addr: z.string(),
  local_name: z.string().optional(),
  rssi: z.number(),
  encrypted: z.boolean(),
});
export const SHELLY_ZONE = z.object({
  key: SHELLY_COMPONENT_KEY,
  externalId: z.string(),
  generation: z.int().nonnegative(),
  main: z.boolean(),
  config: SHELLY_ZONE_SETTINGS,
  status: SHELLY_ZONE_STATUS.nullable(),
});
export const SHELLY_LIGHT = z.object({
  config: SHELLY_LIGHT_SETTINGS,
  status: SHELLY_LIGHT_STATUS.nullable(),
});
export const SHELLY_DEVICE = z.object({
  id: z.string(),
  externalId: z.string(),
  name: z.string(),
  address: z.string(),
  info: SHELLY_DEVICE_INFO,
  connection: SHELLY_CONNECTION,
  observedAt: z.iso.datetime({ offset: true }).nullable(),
  config: SHELLY_PRESENCE_SETTINGS.nullable(),
  status: SHELLY_PRESENCE_STATUS.nullable(),
  revision: SHELLY_REVISION.nullable(),
  zones: z.array(SHELLY_ZONE),
  light: z.array(SHELLY_LIGHT),
  tracks: z.array(SHELLY_TRACK),
  tracksAt: z.iso.datetime({ offset: true }).nullable(),
  methods: z.array(z.string()),
  componentKeys: z.array(SHELLY_COMPONENT_KEY),
  features: z.array(SHELLY_FEATURE),
  components: z.array(SHELLY_COMPONENT),
  resources: SHELLY_RESOURCES.optional(),
  discoveredBthome: z.array(SHELLY_DISCOVERED_BTHOME),
});
export const SHELLY_SNAPSHOT = z.object({
  at: z.iso.datetime({ offset: true }),
  devices: z.array(SHELLY_DEVICE),
});
export const SHELLY_TRACKS = z.object({
  devices: z.array(
    z.object({
      id: z.string(),
      tracks: z.array(SHELLY_TRACK),
      tracksAt: z.iso.datetime({ offset: true }).nullable(),
    }),
  ),
});
export type ShellyDevice = z.output<typeof SHELLY_DEVICE>;
export type ShellyZone = z.output<typeof SHELLY_ZONE>;
export type ShellySnapshot = z.output<typeof SHELLY_SNAPSHOT>;
export type ShellyTracks = z.output<typeof SHELLY_TRACKS>;
