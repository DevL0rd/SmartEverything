import { describe, expect, it } from 'vitest';
import { catalogueMetadata, placementFacts } from '../../src/models/placement';
import { MODEL_SPEC, type ModelSpec } from '../../src/models/spec';

const VIEW = { yaw: 30, pitch: 20, fov: 35, padding: 0.1 };

const BASE = {
  schema: 1,
  id: 'cat.seating.sofa',
  version: '1.2.0',
  title: 'Sofa',
  category: 'seating',
  footprint: { width: 2, depth: 0.9, height: 0.85 },
  framing: { tile: VIEW, card: VIEW, hero: VIEW },
  materials: { body: { color: '#445566' } },
  parts: [{ id: 'shell', geometry: { type: 'sphere', radius: 0.1 }, material: 'body' }],
};

function spec(extra: Record<string, unknown>): ModelSpec {
  return MODEL_SPEC.parse({ ...BASE, ...extra });
}

describe('placementFacts from the registry alone', () => {
  it('returns the family facts for a built-in kind default', () => {
    expect(placementFacts('dev.air_purifier.none')).toBeUndefined();
    expect(placementFacts('dev.purifier.generic')).toEqual({
      mount: 'floor',
      defaultHeightM: 0,
      footprint: { w: 0.24, d: 0.24, h: 0.5 },
    });
  });

  it('maps every kind of the family table to wall, ceiling, floor or table facts', () => {
    const cases: [string, string][] = [
      ['dev.ac.split-indoor', 'wall'],
      ['dev.light.bulb-a60', 'ceiling'],
      ['dev.switch.wall-rocker', 'wall'],
      ['dev.microwave.countertop', 'table'],
      ['dev.laundry.washer-front', 'floor'],
      ['dev.camera.dome-indoor', 'wall'],
      ['dev.fan.tower', 'floor'],
      ['dev.service.shield', 'table'],
    ];
    for (const [id, mount] of cases) expect(placementFacts(id)?.mount).toBe(mount);
  });

  it('lets an exact model override the mount and its height', () => {
    expect(placementFacts('dev.light.floor-lamp')).toMatchObject({ mount: 'floor' });
    expect(placementFacts('dev.light.wall-sconce')).toMatchObject({
      mount: 'wall',
      defaultHeightM: 1.6,
    });
    expect(placementFacts('dev.sensor.door-xiaomi-dw2hl')).toMatchObject({
      mount: 'wall',
      defaultHeightM: 2,
    });
    expect(placementFacts('dev.fan.ceiling')).toMatchObject({ mount: 'ceiling' });
  });

  it('has no field of view for a camera model without published data', () => {
    const camera = placementFacts('dev.camera.xiaomi-083ae2');
    expect(camera).toBeDefined();
    expect(camera).not.toHaveProperty('fov');
  });

  it('knows nothing about an unknown id without a spec', () => {
    expect(placementFacts('cat.seating.sofa')).toBeUndefined();
    expect(placementFacts('dev.car.ev')).toBeUndefined();
  });
});

describe('placementFacts with a spec', () => {
  it('takes the footprint from the spec in metres and the mount from its anchor', () => {
    const sofa = spec({ anchors: [{ kind: 'mount', id: 'floor', mount: 'floor' }] });
    expect(placementFacts(sofa.id, sofa)).toEqual({
      mount: 'floor',
      defaultHeightM: 0,
      footprint: { w: 2, d: 0.9, h: 0.85 },
    });
  });

  it('maps the desk mount anchor to table and a ceiling anchor to the ceiling height', () => {
    const desk = spec({ anchors: [{ kind: 'mount', id: 'm', mount: 'desk' }] });
    expect(placementFacts(desk.id, desk)).toMatchObject({ mount: 'table', defaultHeightM: 0.75 });
    const lamp = spec({ anchors: [{ kind: 'mount', id: 'm', mount: 'ceiling' }] });
    expect(placementFacts(lamp.id, lamp)).toMatchObject({ mount: 'ceiling', defaultHeightM: 2.4 });
  });

  it('prefers the spec mount over the registry and drops a registry height of another mount', () => {
    const fan = spec({
      id: 'dev.fan.tower',
      footprint: { width: 0.2, depth: 0.2, height: 1 },
      anchors: [{ kind: 'mount', id: 'm', mount: 'wall' }],
    });
    expect(placementFacts(fan.id, fan)).toMatchObject({ mount: 'wall', defaultHeightM: 1.2 });
  });

  it('keeps the registry height when the spec agrees on the mount', () => {
    const sconce = spec({
      id: 'dev.light.wall-sconce',
      anchors: [{ kind: 'mount', id: 'm', mount: 'wall' }],
    });
    expect(placementFacts(sconce.id, sconce)?.defaultHeightM).toBe(1.6);
  });

  it('falls back to the family table for a spec without a mount anchor', () => {
    const stick = spec({ id: 'dev.vacuum.stick', family: 'vacuum' });
    expect(placementFacts(stick.id, stick)).toMatchObject({ mount: 'floor' });
    const orphan = spec({ id: 'dev.bed.sleep-sensor' });
    expect(placementFacts(orphan.id, orphan)).toBeUndefined();
  });

  it('passes the field of view of the spec through, with its exact flag', () => {
    const exact = { hDeg: 110, vDeg: 60, rangeM: 8, exact: true };
    const camera = spec({ id: 'dev.camera.xiaomi-083ae2', family: 'camera', fov: exact });
    expect(placementFacts(camera.id, camera)?.fov).toEqual(exact);
    const guess = { ...exact, exact: false };
    const other = spec({ id: 'dev.camera.dome-indoor', family: 'camera', fov: guess });
    expect(placementFacts(other.id, other)?.fov?.exact).toBe(false);
  });

  it('is pure: the same input gives equal results and the spec is not changed', () => {
    const sofa = spec({ anchors: [{ kind: 'mount', id: 'floor', mount: 'floor' }] });
    const before = JSON.stringify(sofa);
    expect(placementFacts(sofa.id, sofa)).toEqual(placementFacts(sofa.id, sofa));
    expect(JSON.stringify(sofa)).toBe(before);
  });
});

describe('catalogueMetadata', () => {
  it('derives names, mount, height, finishes and aliases from the spec', () => {
    const sofa = spec({
      anchors: [{ kind: 'mount', id: 'floor', mount: 'floor' }],
      meta: {
        names: { display: 'Three seat sofa', synonyms: ['couch'] },
        sizeClass: 'large',
        variants: ['two-seat'],
        aliases: ['home-map.sofa'],
      },
      finishes: { grey: { body: { color: '#888888' } } },
    });
    expect(catalogueMetadata(sofa)).toEqual({
      id: 'cat.seating.sofa',
      version: '1.2.0',
      category: 'seating',
      names: { display: 'Three seat sofa', synonyms: ['couch'] },
      sizeClass: 'large',
      mount: 'floor',
      defaultHeightM: 0,
      variants: ['two-seat'],
      finishes: ['grey'],
      aliases: ['home-map.sofa'],
    });
  });

  it('uses the title when the spec has no meta and gives nothing without a mount', () => {
    const lamp = spec({
      id: 'cat.lighting.lamp',
      anchors: [{ kind: 'mount', id: 'm', mount: 'desk' }],
    });
    expect(catalogueMetadata(lamp)?.names).toEqual({ display: 'Sofa', synonyms: [] });
    expect(catalogueMetadata(spec({ id: 'cat.misc.thing' }))).toBeUndefined();
  });
});
