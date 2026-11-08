import {
  createModelCatalog,
  createOverrideIndex,
  MODEL_SPEC,
  type DeviceRow,
  type ModelCatalogRow,
  type ModelOverrideRow,
  type ModelSpec,
} from '@smarteverything/domain';
import { describe, expect, it, vi } from 'vitest';

vi.mock('../../../api/transport', () => ({ api: (): unknown => ({}) }));
vi.mock('./asset-cache', () => ({ assetCache: {} }));
vi.mock('expo-crypto', () => ({ CryptoDigestAlgorithm: { SHA256: 'SHA-256' }, digest: vi.fn() }));

const { deviceFixture } = await import('../../../store/device-fixture');
const { sceneModelWantsOf, sceneModelsOf } = await import('./use-scene-models');
type Sources = Parameters<typeof sceneModelWantsOf>[1];

const NO_MATCH = {
  exact: [],
  prefix: [],
  normalised: [],
  product: [],
  hardwareModel: [],
  families: [],
};

function row(id: string, hash: string, patch: Partial<ModelCatalogRow> = {}): ModelCatalogRow {
  return {
    id,
    version: '1.0.0',
    owner: 'builtin',
    title: id,
    category: 'light',
    match: NO_MATCH,
    brands: [],
    aliases: [],
    extras: [],
    spec_sha256: hash,
    ...patch,
  };
}

function override(target: string, assetHash: string): ModelOverrideRow {
  return {
    scope: 'device',
    target,
    model_id: null,
    asset_hash: assetHash,
    finish: null,
    params: {},
    set_by: 'me',
    updated_at: '2026-10-01T00:00:00.000Z',
  };
}

function object(modelId: string | null): { readonly modelId: string | null } {
  return { modelId };
}

function placement(deviceId: string): { readonly deviceId: string } {
  return { deviceId };
}

const VIEW = { yaw: 0, pitch: 0, fov: 30, padding: 0.1 };

function spec(id: string): ModelSpec {
  return MODEL_SPEC.parse({
    schema: 1,
    id,
    version: '1.0.0',
    title: id,
    category: 'light',
    footprint: { width: 0.1, depth: 0.1, height: 0.1 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: { body: { finish: 'matte-white' } },
    parts: [
      {
        id: 'base',
        geometry: { type: 'cylinder', height: 0.03, topRadius: 0.02, bottomRadius: 0.015 },
        material: 'body',
      },
    ],
  });
}

const LAMP = deviceFixture(1, { manufacturer: 'Wiz', model: 'A60' });
const TV = deviceFixture(2, { manufacturer: 'Acme', model: 'Panel' });
const SOFA = row('cat.sofa', 'sofa-hash', { category: 'furniture' });
const BULB = row('dev.light.wiz-a60', 'bulb-hash', {
  match: { ...NO_MATCH, normalised: ['a60'] },
  brands: ['Wiz'],
});

function sourcesOf(
  devices: readonly DeviceRow[],
  overrides: readonly ModelOverrideRow[] = [],
  kinds: Readonly<Record<string, 'spec' | 'glb'>> = {},
): Sources {
  const byId = new Map(devices.map((device) => [device.id, device]));
  return {
    deviceOf: (deviceId) => byId.get(deviceId),
    assetKindOf: (hash) => kinds[hash] ?? null,
    catalog: createModelCatalog([SOFA, BULB]),
    overrides: createOverrideIndex(overrides),
  };
}

describe('sceneModelWantsOf', () => {
  it('asks for the catalogue spec of each placed object once and of each resolved device', () => {
    const floor = {
      objects: [object('cat.sofa'), object('cat.sofa'), object(null)],
      placements: [placement(LAMP.id), placement(TV.id), placement('gone')],
    };
    expect(sceneModelWantsOf(floor, sourcesOf([LAMP, TV]))).toEqual({
      objects: ['sofa-hash'],
      devices: [{ deviceId: LAMP.id, hash: 'bulb-hash' }],
    });
  });

  it('uses an uploaded spec override but skips uploaded glb models', () => {
    const floor = { objects: [], placements: [placement(LAMP.id), placement(TV.id)] };
    const overrides = [override(LAMP.id, 'own-spec'), override(TV.id, 'own-glb')];
    const sources = sourcesOf([LAMP, TV], overrides, { 'own-spec': 'spec', 'own-glb': 'glb' });
    expect(sceneModelWantsOf(floor, sources).devices).toEqual([
      { deviceId: LAMP.id, hash: 'own-spec' },
    ]);
  });
});

describe('sceneModelsOf', () => {
  it('sends each loaded spec once and maps devices to their spec id', () => {
    const loaded = new Map([
      ['sofa-hash', spec('cat.sofa')],
      ['bulb-hash', spec('dev.light.wiz-a60')],
    ]);
    const wire = sceneModelsOf(
      {
        objects: ['sofa-hash'],
        devices: [
          { deviceId: 'lamp-1', hash: 'bulb-hash' },
          { deviceId: 'lamp-2', hash: 'bulb-hash' },
          { deviceId: 'tv', hash: 'loading-hash' },
        ],
      },
      (hash) => loaded.get(hash),
    );
    expect(wire.specs.map((item) => item.id)).toEqual(['cat.sofa', 'dev.light.wiz-a60']);
    expect(wire.devices).toEqual({ 'lamp-1': 'dev.light.wiz-a60', 'lamp-2': 'dev.light.wiz-a60' });
  });
});
