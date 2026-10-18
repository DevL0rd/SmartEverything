import { SHELLY_BTHOME_DISCOVERED } from './shelly-presence-bthome';
import { z } from 'zod';
import { SHELLY_RESOURCES } from './shelly-presence-resources';
import { SHELLY_COMPONENT } from './shelly-presence-components';
import {
  SHELLY_LIGHT_CONFIG,
  SHELLY_LIGHT_STATUS,
  SHELLY_PRESENCE_CONFIG,
  SHELLY_PRESENCE_STATUS,
  SHELLY_ZONE_CONFIG,
  SHELLY_ZONE_STATUS,
} from './shelly-presence-config';
import { SHELLY_COMPONENT_KEY, SHELLY_ID, SHELLY_REVISION } from './shelly-presence-primitives';
import { SHELLY_PRESENCE_PAGE } from './shelly-presence-pages';

export const SHELLY_DEVICE_INFO = z.object({
  id: SHELLY_ID,
  mac: z.string().min(1).max(40),
  model: z.string().min(1).max(80),
  gen: z.int().min(2).max(4),
  fw_id: z.string().max(200),
  ver: z.string().min(1).max(80),
  app: z.string().min(1).max(80),
  auth_en: z.boolean(),
  auth_domain: z.string().max(100).nullable().optional(),
  profile: z.string().max(80).optional(),
  provision: z.string().max(40).optional(),
});
export const SHELLY_PRESENCE_CONNECTION = z.object({
  state: z.enum(['connecting', 'online', 'offline', 'needs_auth', 'paused']),
  reason: z.string().max(500).nullable(),
});
export const SHELLY_TRACK = z.object({
  id: z.int().nonnegative(),
  x: z.number(),
  y: z.number(),
  z: z.number(),
  minz: z.number().optional(),
  maxz: z.number().optional(),
});
export const SHELLY_PRESENCE_FEATURE = z.object({
  id: z.string().min(1).max(100),
  page: SHELLY_PRESENCE_PAGE,
  focus: z.string().min(1).max(100),
  available: z.boolean(),
  reason: z.string().max(300).nullable(),
});
export const SHELLY_PRESENCE_ZONE = z.object({
  key: SHELLY_COMPONENT_KEY,
  externalId: z.string().min(1).max(200),
  generation: z.int().nonnegative(),
  main: z.boolean(),
  config: SHELLY_ZONE_CONFIG,
  status: SHELLY_ZONE_STATUS.nullable(),
});
export const SHELLY_PRESENCE_LIGHT = z.object({
  config: SHELLY_LIGHT_CONFIG,
  status: SHELLY_LIGHT_STATUS.nullable(),
});
export const SHELLY_PRESENCE_DEVICE = z.object({
  id: SHELLY_ID,
  externalId: z.string().min(1).max(200),
  name: z.string().min(1).max(120),
  address: z.string().min(1).max(300),
  info: SHELLY_DEVICE_INFO,
  connection: SHELLY_PRESENCE_CONNECTION,
  observedAt: z.iso.datetime({ offset: true }).nullable(),
  config: SHELLY_PRESENCE_CONFIG.nullable(),
  status: SHELLY_PRESENCE_STATUS.nullable(),
  revision: SHELLY_REVISION.nullable(),
  zones: z.array(SHELLY_PRESENCE_ZONE).max(64),
  light: z.array(SHELLY_PRESENCE_LIGHT).max(32),
  tracks: z.array(SHELLY_TRACK).max(32),
  tracksAt: z.iso.datetime({ offset: true }).nullable(),
  methods: z.array(z.string().min(1).max(100)).max(1024),
  componentKeys: z.array(SHELLY_COMPONENT_KEY).max(512),
  features: z.array(SHELLY_PRESENCE_FEATURE).max(512),
  components: z.array(SHELLY_COMPONENT).max(512).default([]),
  resources: SHELLY_RESOURCES.optional(),
  discoveredBthome: z.array(SHELLY_BTHOME_DISCOVERED).max(64).default([]),
});
export const SHELLY_PRESENCE_SNAPSHOT = z.object({
  at: z.iso.datetime({ offset: true }),
  devices: z.array(SHELLY_PRESENCE_DEVICE).max(64),
  discovery: z.object({
    state: z.enum(['idle', 'running', 'unavailable']),
    reason: z.string().max(500).nullable(),
  }),
});
export const SHELLY_PRESENCE_TRACKS = z.object({
  devices: z
    .array(
      z.object({
        id: SHELLY_ID,
        tracks: z.array(SHELLY_TRACK).max(32),
        tracksAt: z.iso.datetime({ offset: true }).nullable(),
      }),
    )
    .max(64),
});
export type ShellyPresenceTracks = z.output<typeof SHELLY_PRESENCE_TRACKS>;
export type ShellyPresenceDevice = z.output<typeof SHELLY_PRESENCE_DEVICE>;
export type ShellyPresenceSnapshot = z.output<typeof SHELLY_PRESENCE_SNAPSHOT>;
export type ShellyPresenceZone = z.output<typeof SHELLY_PRESENCE_ZONE>;
export type ShellyTrack = z.output<typeof SHELLY_TRACK>;
