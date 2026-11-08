import type { CapabilityKey, JsonValue } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import {
  VacuumCodecError,
  decodeAiObjects,
  decodeFurniture,
  decodeHiddenZones,
  decodeRestrictedAreas,
  decodeSills,
  decodeVirtualWalls,
  type PushedMapObjects,
} from '@smarteverything/xiaomi';
import { vacuumPropertyKey } from './capabilities';

type Layer = keyof PushedMapObjects;

interface LayerSource<K extends Layer> {
  readonly key: CapabilityKey;
  readonly decode: (text: string) => PushedMapObjects[K];
}

type LayerSources = { readonly [K in Layer]: LayerSource<K> };

const LAYERS: LayerSources = {
  restrictedAreas: {
    key: vacuumPropertyKey('restricted-sweep-areas'),
    decode: decodeRestrictedAreas,
  },
  virtualWalls: { key: vacuumPropertyKey('restricted-walls'), decode: decodeVirtualWalls },
  hiddenZones: { key: vacuumPropertyKey('map-hidden-zone'), decode: decodeHiddenZones },
  sills: { key: vacuumPropertyKey('sill'), decode: decodeSills },
  furniture: { key: vacuumPropertyKey('sweep-furniture'), decode: decodeFurniture },
  aiObjects: { key: vacuumPropertyKey('sweep-ai-object'), decode: decodeAiObjects },
};

export type PushedValue = (key: CapabilityKey) => JsonValue | undefined;

function layerOf<K extends Layer>(
  layer: K,
  source: LayerSource<K>,
  value: PushedValue,
  report: (layer: Layer, error: VacuumCodecError) => void,
): PushedMapObjects[K] | readonly [] {
  const text = value(source.key);
  if (typeof text !== 'string' || text === '') return [];
  try {
    return source.decode(text);
  } catch (error) {
    if (!(error instanceof VacuumCodecError)) throw error;
    report(layer, error);
    return [];
  }
}

export function pushedObjectsOf(
  deviceId: string,
  value: PushedValue,
  log: Logger,
): PushedMapObjects {
  const report = (layer: Layer, error: VacuumCodecError): void => {
    log.warn('vacuum_map.pushed_layer_unreadable', { deviceId, layer, reason: error.message });
  };
  return {
    restrictedAreas: layerOf('restrictedAreas', LAYERS.restrictedAreas, value, report),
    virtualWalls: layerOf('virtualWalls', LAYERS.virtualWalls, value, report),
    hiddenZones: layerOf('hiddenZones', LAYERS.hiddenZones, value, report),
    sills: layerOf('sills', LAYERS.sills, value, report),
    furniture: layerOf('furniture', LAYERS.furniture, value, report),
    aiObjects: layerOf('aiObjects', LAYERS.aiObjects, value, report),
  };
}
