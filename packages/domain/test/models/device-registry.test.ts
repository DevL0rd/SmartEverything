import { describe, expect, it } from 'vitest';
import { DEVICE_FAMILIES } from '../../src/presentation/types';
import {
  createModelMetadataIndex,
  DEVICE_REGISTRY_ENTRY,
  FAMILY_PLACEMENT,
  familyOfModel,
  KIND_FAMILY,
  MODEL_CATALOGUE_METADATA,
  MODEL_PLACEMENT,
  registryPlacement,
  type ModelCatalogueMetadata,
} from '../../src/models/device-registry';
import * as domain from '../../src';

function row(id: string, extra: Record<string, unknown> = {}): ModelCatalogueMetadata {
  return meta({ id, ...extra });
}

function meta(extra: Record<string, unknown>): ModelCatalogueMetadata {
  return MODEL_CATALOGUE_METADATA.parse({
    id: 'cat.seating.sofa',
    version: '1.0.0',
    category: 'seating',
    names: { display: 'Sofa', synonyms: ['couch'] },
    mount: 'floor',
    defaultHeightM: 0,
    ...extra,
  });
}

describe('family placement table', () => {
  it('has a valid entry for every one of the 39 families', () => {
    expect(DEVICE_FAMILIES).toHaveLength(39);
    for (const family of DEVICE_FAMILIES) {
      expect(DEVICE_REGISTRY_ENTRY.safeParse(FAMILY_PLACEMENT[family]).success).toBe(true);
    }
  });

  it('never claims a field of view for a family default', () => {
    for (const family of DEVICE_FAMILIES)
      expect(FAMILY_PLACEMENT[family]).not.toHaveProperty('fov');
  });
});

describe('model placement lookup', () => {
  it('points every kind segment and exact entry at a real family', () => {
    for (const family of Object.values(KIND_FAMILY)) expect(DEVICE_FAMILIES).toContain(family);
    for (const entry of Object.values(MODEL_PLACEMENT))
      expect(DEVICE_FAMILIES).toContain(entry.family);
  });

  it('resolves exact ids first and kind segments second', () => {
    expect(familyOfModel('dev.fan.tower')).toBe('tower_fan');
    expect(familyOfModel('dev.fan.pedestal')).toBe('fan');
    expect(familyOfModel('dev.remote.tv')).toBe('ir_remote');
    expect(familyOfModel('dev.tablet.galaxy-tab-s9-ultra')).toBe('phone');
    expect(familyOfModel('dev.service.sync')).toBe('file_sync');
    expect(familyOfModel('cat.seating.sofa')).toBeUndefined();
    expect(familyOfModel('dev.car.ev')).toBeUndefined();
  });

  it('validates every resolved entry and keeps registry fov exact only', () => {
    for (const id of Object.keys(MODEL_PLACEMENT)) {
      expect(DEVICE_REGISTRY_ENTRY.safeParse(registryPlacement(id)).success).toBe(true);
    }
    const inexact = {
      ...FAMILY_PLACEMENT.camera,
      fov: { hDeg: 90, vDeg: 50, rangeM: 5, exact: false },
    };
    expect(DEVICE_REGISTRY_ENTRY.safeParse(inexact).success).toBe(false);
    const exact = { ...inexact, fov: { ...inexact.fov, exact: true } };
    expect(DEVICE_REGISTRY_ENTRY.safeParse(exact).success).toBe(true);
  });
});

describe('catalogue metadata schema', () => {
  it('fills defaults and ignores unknown fields', () => {
    const parsed = MODEL_CATALOGUE_METADATA.parse({
      id: 'cat.seating.sofa',
      version: '1.0.0',
      category: 'seating',
      names: { display: 'Sofa' },
      mount: 'floor',
      defaultHeightM: 0,
      futureField: 1,
    });
    expect(parsed).toMatchObject({
      variants: [],
      finishes: [],
      aliases: [],
      names: { synonyms: [] },
    });
    expect(parsed).not.toHaveProperty('futureField');
  });

  it('rejects a bad id, mount or height', () => {
    expect(MODEL_CATALOGUE_METADATA.safeParse({ ...meta({}), id: 'sofa' }).success).toBe(false);
    expect(MODEL_CATALOGUE_METADATA.safeParse({ ...meta({}), mount: 'sky' }).success).toBe(false);
    expect(MODEL_CATALOGUE_METADATA.safeParse({ ...meta({}), defaultHeightM: -1 }).success).toBe(
      false,
    );
  });
});

describe('model metadata index', () => {
  const sofa = row('cat.seating.sofa', { aliases: ['home-map.sofa'] });
  const lamp = row('cat.lighting.floor-lamp', {
    names: { display: 'Floor lamp', synonyms: ['standing lamp'] },
  });

  it('finds a model by id and by an alias of its meta', () => {
    const index = createModelMetadataIndex([sofa, lamp]);
    expect(index.find('cat.seating.sofa')?.id).toBe('cat.seating.sofa');
    expect(index.find('home-map.sofa')?.id).toBe('cat.seating.sofa');
    expect(index.find('home-map.nothing')).toBeUndefined();
    expect(index.conflicts).toEqual([]);
  });

  it('keeps the newest version of an id and resolves its aliases to it', () => {
    const next = row('cat.seating.sofa', { version: '1.1.0', aliases: ['home-map.sofa'] });
    const index = createModelMetadataIndex([next, sofa]);
    expect(index.entries).toHaveLength(1);
    expect(index.find('home-map.sofa')?.version).toBe('1.1.0');
  });

  it('lets an id win over an alias and reports alias clashes between models', () => {
    const clash = row('cat.seating.chair', { aliases: ['cat.seating.sofa', 'home-map.sofa'] });
    const index = createModelMetadataIndex([sofa, clash]);
    expect(index.find('cat.seating.sofa')?.id).toBe('cat.seating.sofa');
    expect(index.find('home-map.sofa')?.id).toBe('cat.seating.chair');
    expect(index.conflicts).toEqual([
      { alias: 'cat.seating.sofa', kept: 'cat.seating.sofa', dropped: 'cat.seating.chair' },
      { alias: 'home-map.sofa', kept: 'cat.seating.chair', dropped: 'cat.seating.sofa' },
    ]);
  });

  it('searches names and synonyms, best match first, and lists everything for empty text', () => {
    const index = createModelMetadataIndex([sofa, lamp]);
    expect(index.search('couch').map((r) => r.id)).toEqual(['cat.seating.sofa']);
    expect(index.search('STANDING').map((r) => r.id)).toEqual(['cat.lighting.floor-lamp']);
    expect(index.search('lamp').map((r) => r.id)).toEqual(['cat.lighting.floor-lamp']);
    expect(index.search('zebra')).toEqual([]);
    expect(index.search('  ')).toHaveLength(2);
  });
});

describe('domain index exports', () => {
  it('loads the modules and exposes placementFacts', () => {
    expect(typeof domain.placementFacts).toBe('function');
    expect(typeof domain.createModelMetadataIndex).toBe('function');
  });
});
