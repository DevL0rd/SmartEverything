import { z } from 'zod';
import type { DeviceFamily } from '../presentation/types';
import { compareVersions } from './match';
import { MODEL_SPEC_FOV, type ModelSpecFov } from './spec';
import { MODEL_ID, NAME, SEMVER, TOKEN } from './spec-base';
import { OMNI_STATION_FOOTPRINT, type PlacementFootprint } from './placement-footprint';

export const PLACEMENT_MOUNTS = ['floor', 'wall', 'ceiling', 'table'] as const;

export type PlacementMount = (typeof PLACEMENT_MOUNTS)[number];

export const MOUNT_HEIGHT_M = {
  floor: 0,
  table: 0.75,
  wall: 1.2,
  ceiling: 2.4,
} as const satisfies Readonly<Record<PlacementMount, number>>;

export interface PlacementEntry {
  readonly mount: PlacementMount;
  readonly defaultHeightM: number;
  readonly footprint: PlacementFootprint;
  readonly fov?: ModelSpecFov;
}

export interface ModelPlacementEntry {
  readonly family: DeviceFamily;
  readonly placement?: Partial<PlacementEntry>;
}

function entry(
  mount: PlacementMount,
  defaultHeightM: number,
  size: readonly [number, number, number],
): PlacementEntry {
  return { mount, defaultHeightM, footprint: { w: size[0], d: size[1], h: size[2] } };
}

export const FAMILY_PLACEMENT: Readonly<Record<DeviceFamily, PlacementEntry>> = {
  air_purifier: entry('floor', 0, [0.24, 0.24, 0.5]),
  humidifier: entry('floor', 0, [0.28, 0.28, 0.5]),
  diffuser: entry('table', 0.75, [0.12, 0.12, 0.18]),
  microwave: entry('table', 0.75, [0.5, 0.4, 0.3]),
  laundry: entry('floor', 0, [0.6, 0.65, 0.85]),
  dehumidifier: entry('floor', 0, [0.35, 0.25, 0.6]),
  tower_fan: entry('floor', 0, [0.2, 0.2, 1]),
  fan: entry('floor', 0, [0.4, 0.4, 1.2]),
  heater: entry('floor', 0, [0.3, 0.2, 0.6]),
  air_conditioner: entry('wall', 2, [0.85, 0.22, 0.3]),
  thermostat: entry('wall', 1.5, [0.1, 0.03, 0.1]),
  light: entry('ceiling', 2.4, [0.06, 0.06, 0.11]),
  switch: entry('wall', 1.2, [0.086, 0.02, 0.086]),
  plug: entry('wall', 0.3, [0.06, 0.04, 0.06]),
  sensor: entry('wall', 1.5, [0.06, 0.03, 0.06]),
  button: entry('wall', 1.2, [0.05, 0.015, 0.05]),
  camera: entry('wall', 2.2, [0.07, 0.07, 0.1]),
  doorbell: entry('wall', 1.3, [0.05, 0.03, 0.12]),
  scale: entry('floor', 0, [0.3, 0.3, 0.03]),
  wearable: entry('table', 0.75, [0.05, 0.05, 0.02]),
  television: entry('wall', 0.8, [1.45, 0.06, 0.85]),
  speaker: entry('table', 0.75, [0.12, 0.12, 0.2]),
  lock: entry('wall', 1, [0.06, 0.05, 0.16]),
  cover: entry('wall', 0.5, [1.2, 0.08, 1.5]),
  vacuum: entry('floor', 0, [0.35, 0.35, 0.1]),
  ir_blaster: entry('table', 0.75, [0.07, 0.07, 0.03]),
  ir_remote: entry('table', 0.75, [0.05, 0.02, 0.17]),
  gateway: entry('table', 0.75, [0.08, 0.08, 0.03]),
  computer: entry('table', 0.75, [0.36, 0.26, 0.24]),
  phone: entry('table', 0.75, [0.07, 0.15, 0.01]),
  router: entry('table', 0.75, [0.3, 0.2, 0.06]),
  file_sync: entry('table', 0.75, [0.05, 0.05, 0.05]),
  dns_filter: entry('table', 0.75, [0.05, 0.05, 0.05]),
  robot: entry('table', 0.75, [0.15, 0.15, 0.2]),
  treadmill: entry('floor', 0, [0.7, 1.4, 1.1]),
  printer: entry('table', 0.75, [0.45, 0.35, 0.2]),
  bottle: entry('table', 0.75, [0.08, 0.08, 0.26]),
  toothbrush: entry('table', 0.75, [0.03, 0.03, 0.2]),
  generic: entry('table', 0.75, [0.06, 0.06, 0.06]),
};

export const KIND_FAMILY: Readonly<Record<string, DeviceFamily>> = {
  ac: 'air_conditioner',
  button: 'button',
  bottle: 'bottle',
  camera: 'camera',
  computer: 'computer',
  cover: 'cover',
  diffuser: 'diffuser',
  doorbell: 'doorbell',
  fan: 'fan',
  gateway: 'gateway',
  generic: 'generic',
  heater: 'heater',
  humidifier: 'humidifier',
  ir: 'ir_blaster',
  laundry: 'laundry',
  light: 'light',
  lock: 'lock',
  microwave: 'microwave',
  monitor: 'television',
  phone: 'phone',
  plug: 'plug',
  printer: 'printer',
  purifier: 'air_purifier',
  remote: 'ir_remote',
  robot: 'robot',
  router: 'router',
  scale: 'scale',
  sensor: 'sensor',
  speaker: 'speaker',
  switch: 'switch',
  tablet: 'phone',
  thermostat: 'thermostat',
  toothbrush: 'toothbrush',
  treadmill: 'treadmill',
  tv: 'television',
  vacuum: 'vacuum',
  watch: 'wearable',
};

export const OMNI_STATION_MODEL_ID = 'dev.vacuum.omni-station-pv11gl';

export const MODEL_PLACEMENT: Readonly<Record<string, ModelPlacementEntry>> = {
  'dev.fan.tower': { family: 'tower_fan' },
  'dev.fan.xiaomi-tower-2': { family: 'tower_fan' },
  'dev.fan.ceiling': {
    family: 'fan',
    placement: { mount: 'ceiling', defaultHeightM: MOUNT_HEIGHT_M.ceiling },
  },
  'dev.fan.desk': {
    family: 'fan',
    placement: { mount: 'table', defaultHeightM: MOUNT_HEIGHT_M.table },
  },
  'dev.service.sync': { family: 'file_sync' },
  'dev.service.shield': { family: 'dns_filter' },
  'dev.ac.portable': {
    family: 'air_conditioner',
    placement: { mount: 'floor', defaultHeightM: 0 },
  },
  'dev.light.wall-sconce': { family: 'light', placement: { mount: 'wall', defaultHeightM: 1.6 } },
  'dev.light.desk-lamp': {
    family: 'light',
    placement: { mount: 'table', defaultHeightM: MOUNT_HEIGHT_M.table },
  },
  'dev.light.floor-lamp': { family: 'light', placement: { mount: 'floor', defaultHeightM: 0 } },
  'dev.sensor.door-xiaomi-dw2hl': {
    family: 'sensor',
    placement: { mount: 'wall', defaultHeightM: 2 },
  },
  'dev.monitor.samsung-g9-oled-49': {
    family: 'television',
    placement: { mount: 'table', defaultHeightM: 0.75 },
  },
  [OMNI_STATION_MODEL_ID]: {
    family: 'vacuum',
    placement: { mount: 'floor', defaultHeightM: 0, footprint: OMNI_STATION_FOOTPRINT },
  },
};

export const DEVICE_REGISTRY_ENTRY = z.strictObject({
  mount: z.enum(PLACEMENT_MOUNTS),
  defaultHeightM: z.number().min(0).max(50),
  footprint: z.strictObject({
    w: z.number().positive().max(50),
    d: z.number().positive().max(50),
    h: z.number().positive().max(50),
  }),
  fov: MODEL_SPEC_FOV.refine((fov) => fov.exact, {
    message: 'the registry holds only published field of view data',
  }).optional(),
});

export function familyOfModel(modelId: string): DeviceFamily | undefined {
  const explicit = MODEL_PLACEMENT[modelId];
  if (explicit !== undefined) return explicit.family;
  const segments = modelId.split('.');
  return segments[0] === 'dev' ? KIND_FAMILY[segments[1] ?? ''] : undefined;
}

function mergePlacement(
  base: PlacementEntry,
  override: ModelPlacementEntry | undefined,
): PlacementEntry {
  return { ...base, ...override?.placement };
}

export function registryPlacement(modelId: string): PlacementEntry | undefined {
  const family = familyOfModel(modelId);
  if (family === undefined) return undefined;
  return mergePlacement(FAMILY_PLACEMENT[family], MODEL_PLACEMENT[modelId]);
}

export const MODEL_CATALOGUE_METADATA = z.object({
  id: MODEL_ID,
  version: SEMVER,
  category: TOKEN,
  names: z.object({
    display: z.string().min(1),
    synonyms: z.array(z.string().min(1)).default([]),
  }),
  sizeClass: TOKEN.optional(),
  mount: z.enum(PLACEMENT_MOUNTS),
  defaultHeightM: z.number().min(0).max(50),
  variants: z.array(NAME).default([]),
  finishes: z.array(NAME).default([]),
  aliases: z.array(z.string().min(1)).default([]),
});

export type ModelCatalogueMetadata = z.output<typeof MODEL_CATALOGUE_METADATA>;

export interface AliasConflict {
  readonly alias: string;
  readonly kept: string;
  readonly dropped: string;
}

export interface ModelMetadataIndex {
  readonly entries: readonly ModelCatalogueMetadata[];
  readonly conflicts: readonly AliasConflict[];
  find(idOrAlias: string): ModelCatalogueMetadata | undefined;
  search(text: string): readonly ModelCatalogueMetadata[];
}

function newest(
  current: ModelCatalogueMetadata | undefined,
  next: ModelCatalogueMetadata,
): ModelCatalogueMetadata {
  return current === undefined || compareVersions(next.version, current.version) > 0
    ? next
    : current;
}

function indexAliases(
  entries: ReadonlyMap<string, ModelCatalogueMetadata>,
): [Map<string, ModelCatalogueMetadata>, AliasConflict[]] {
  const byAlias = new Map<string, ModelCatalogueMetadata>();
  const conflicts: AliasConflict[] = [];
  for (const row of [...entries.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    for (const alias of row.aliases) {
      const held = byAlias.get(alias);
      if (entries.has(alias) || (held !== undefined && held.id !== row.id)) {
        const winner = entries.has(alias) ? alias : (held?.id ?? alias);
        conflicts.push({ alias, kept: winner, dropped: row.id });
        continue;
      }
      byAlias.set(alias, row);
    }
  }
  return [byAlias, conflicts];
}

function matchRank(row: ModelCatalogueMetadata, needle: string): number {
  const names = [row.names.display, ...row.names.synonyms].map((name) => name.toLowerCase());
  if (names.some((name) => name === needle)) return 0;
  if (names.some((name) => name.startsWith(needle))) return 1;
  if (names.some((name) => name.includes(needle)) || row.id.includes(needle)) return 2;
  return 3;
}

function searchRows(
  entries: readonly ModelCatalogueMetadata[],
  text: string,
): readonly ModelCatalogueMetadata[] {
  const needle = text.trim().toLowerCase();
  if (needle === '') return entries;
  return entries
    .map((row) => ({ row, rank: matchRank(row, needle) }))
    .filter((hit) => hit.rank < 3)
    .sort((a, b) => a.rank - b.rank || a.row.id.localeCompare(b.row.id))
    .map((hit) => hit.row);
}

export function createModelMetadataIndex(
  rows: readonly ModelCatalogueMetadata[],
): ModelMetadataIndex {
  const byId = new Map<string, ModelCatalogueMetadata>();
  for (const row of rows) byId.set(row.id, newest(byId.get(row.id), row));
  const [byAlias, conflicts] = indexAliases(byId);
  const entries = [...byId.values()].sort((a, b) => a.id.localeCompare(b.id));
  return {
    entries,
    conflicts,
    find: (idOrAlias) => byId.get(idOrAlias) ?? byAlias.get(idOrAlias),
    search: (text) => searchRows(entries, text),
  };
}
