import type {
  ModelSpec,
  ModelSpecChannel,
  ModelSpecMaterial,
  ModelSpecPart,
} from '@smarteverything/domain';
import { DoubleSide, FrontSide, Group, Mesh, type Object3D } from 'three';
import { describe, expect, it } from 'vitest';
import { mergeStatics } from '../../house-map/3d/scene-merge';
import { buildModel, type BuiltModel } from './build-model';
import { createEmitterHalos } from './emitter-halo';
import { DRAW_ORDER, drawLayer, partSurface, resolveMaterial } from './materials';
import { createSceneModel, createSceneModelSet } from './scene-model';

const VIEW = { yaw: 30, pitch: 18, fov: 28, padding: 0.1 } as const;
const ACCENT: ModelSpecMaterial = { color: '#4C8DFF', roughness: 0.3, opacity: 0 };
const CELLS = [0, 1, 2];

function slab(
  id: string,
  [width, height, depth]: readonly [number, number, number],
  material: string,
  position: readonly [number, number, number],
): ModelSpecPart {
  const [x, y, z] = position;
  return {
    id,
    geometry: { type: 'roundedBox', width, height, depth, radius: 0.001 },
    material,
    transform: { position: [x, y, z] },
  };
}

function cellShow(index: number): ModelSpecChannel {
  return {
    id: `cell${String(index)}Show`,
    target: `cell${String(index)}`,
    property: 'opacity',
    source: 'level',
    map: { type: 'linear', in: [0, 1], out: [0, 1], clamp: true },
    motion: { type: 'pose', easeMs: 0 },
    reduced: 'hold',
  };
}

function domeSpec(): ModelSpec {
  return {
    schema: 1,
    id: 'dev.test.dome-light',
    version: '1.0.0',
    title: 'Dome light',
    category: 'light',
    footprint: { width: 0.2, depth: 0.2, height: 0.2 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: {
      base: { finish: 'graphite' },
      dome: { finish: 'clear-glass' },
      face: { finish: 'smoked-acrylic' },
      accent: ACCENT,
    },
    parts: [
      {
        id: 'base',
        geometry: { type: 'cylinder', height: 0.02, topRadius: 0.09, bottomRadius: 0.09 },
        material: 'base',
      },
      {
        id: 'dome',
        parent: 'base',
        geometry: { type: 'sphere', radius: 0.08 },
        material: 'dome',
      },
      {
        id: 'bulb',
        parent: 'base',
        geometry: { type: 'sphere', radius: 0.02 },
        material: 'accent',
      },
      slab('face', [0.16, 0.06, 0.004], 'face', [0, 0.1, 0.1]),
      ...CELLS.map((index) =>
        slab(`cell${String(index)}`, [0.03, 0.016, 0.0016], 'accent', [
          -0.04 + index * 0.04,
          0.1,
          0.1028,
        ]),
      ),
      {
        id: 'halo',
        geometry: { type: 'glow', width: 0.3, height: 0.3 },
        material: 'accent',
      },
    ],
    channels: CELLS.map(cellShow),
  };
}

function kettleWindowSpec(window: ModelSpecMaterial): ModelSpec {
  return {
    schema: 1,
    id: 'dev.test.kettle-window',
    version: '1.0.0',
    title: 'Kettle window',
    category: 'kitchen',
    footprint: { width: 0.24, depth: 0.2, height: 0.245 },
    framing: { tile: VIEW, card: VIEW, hero: VIEW },
    materials: {
      body: { finish: 'matte-white' },
      trim: window,
      water: { color: '#5AB4E6', roughness: 0.12, clearcoat: 1 },
    },
    parts: [
      {
        id: 'kettle',
        geometry: { type: 'cylinder', height: 0.2, topRadius: 0.07, bottomRadius: 0.088 },
        material: 'body',
      },
      {
        ...slab('window', [0.024, 0.114, 0.008], 'trim', [0.0308, 0.115, 0.0846]),
        parent: 'kettle',
      },
      { ...slab('fill', [0.015, 0.1, 0.003], 'water', [0, 0, 0.0048]), parent: 'window' },
    ],
  };
}

function partOf(model: BuiltModel, id: string): BuiltModel['parts'][number] {
  const part = model.parts.find((item) => item.id === id);
  if (part === undefined) throw new Error(`no part ${id}`);
  return part;
}

function meshes(root: Object3D): Object3D[] {
  const found: Object3D[] = [];
  root.traverse((node) => {
    if (node instanceof Mesh) found.push(node);
  });
  return found;
}

describe('draw layers', () => {
  it('sort solid, see-through shell and glow parts into ordered layers', () => {
    const spec = domeSpec();
    expect(drawLayer(resolveMaterial(spec, 'base', undefined), false)).toBe('solid');
    expect(drawLayer(resolveMaterial(spec, 'dome', undefined), false)).toBe('shell');
    expect(drawLayer(resolveMaterial(spec, 'accent', undefined), false)).toBe('glow');
    expect(drawLayer(resolveMaterial(spec, 'base', undefined), true)).toBe('glow');
    expect(DRAW_ORDER.solid).toBeLessThan(DRAW_ORDER.shell);
    expect(DRAW_ORDER.shell).toBeLessThan(DRAW_ORDER.glow);
    expect(DRAW_ORDER.glow).toBeLessThan(DRAW_ORDER.halo);
  });

  it('make closed see-through shells double sided so their back faces draw first', () => {
    const spec = domeSpec();
    const dome = partSurface(resolveMaterial(spec, 'dome', undefined), {
      flat: false,
      faded: false,
    });
    const base = partSurface(resolveMaterial(spec, 'base', undefined), {
      flat: false,
      faded: false,
    });
    expect(dome).toMatchObject({ layer: 'shell', doubleSided: true });
    expect(base).toMatchObject({ layer: 'solid', doubleSided: false });
  });

  it('draw a glass dome after the solid base and the accent inside it after the dome', () => {
    const model = buildModel(domeSpec(), { lod: 2 });
    const base = partOf(model, 'base').mesh;
    const dome = partOf(model, 'dome').mesh;
    const bulb = partOf(model, 'bulb').mesh;
    expect(base.material).toMatchObject({ transparent: false, depthWrite: true, side: FrontSide });
    expect(dome.material).toMatchObject({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      forceSinglePass: false,
    });
    expect(bulb.material).toMatchObject({ transparent: true, depthWrite: false });
    expect(base.renderOrder).toBe(DRAW_ORDER.solid);
    expect(dome.renderOrder).toBe(DRAW_ORDER.shell);
    expect(bulb.renderOrder).toBe(DRAW_ORDER.glow);
    model.dispose();
  });

  it('draw level cells after the smoked panel they sit on, never writing depth', () => {
    const model = buildModel(domeSpec(), { lod: 2 });
    const face = partOf(model, 'face');
    expect(face.draw).toBe('shell');
    expect(face.mesh.material.depthWrite).toBe(false);
    for (const id of ['cell0', 'cell1', 'cell2']) {
      const cell = partOf(model, id);
      expect(cell.draw).toBe('glow');
      expect(cell.mesh.renderOrder).toBeGreaterThan(face.mesh.renderOrder);
      expect(cell.mesh.material).toMatchObject({ transparent: true, depthWrite: false });
    }
    expect(partOf(model, 'halo').mesh.renderOrder).toBe(DRAW_ORDER.glow);
    model.dispose();
  });

  it('draw the kettle water column after the opaque window frame with nothing drawn over it', () => {
    const model = buildModel(kettleWindowSpec({ finish: 'satin-black' }), { lod: 2 });
    const window = partOf(model, 'window').mesh;
    const fill = partOf(model, 'fill').mesh;
    expect(window.material).toMatchObject({ transparent: false, depthWrite: true });
    expect(fill.material).toMatchObject({ transparent: false, depthWrite: true });
    expect(fill.renderOrder).toBeGreaterThanOrEqual(window.renderOrder);
    const covering = model.parts.filter((part) => part.mesh.material.transparent);
    expect(covering).toEqual([]);
    model.dispose();
  });

  it('draw a see-through kettle window after the water so the water shows through it', () => {
    const model = buildModel(kettleWindowSpec({ finish: 'smoked-acrylic' }), { lod: 2 });
    const window = partOf(model, 'window').mesh;
    const fill = partOf(model, 'fill').mesh;
    expect(fill.material).toMatchObject({ transparent: false, depthWrite: true });
    expect(window.material).toMatchObject({
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
    });
    expect(window.renderOrder).toBeGreaterThan(fill.renderOrder);
    model.dispose();
  });
});

describe('draw layers in every consumer', () => {
  it('keep the layer order on live scene meshes and their emitter halos', () => {
    const live = createSceneModel(domeSpec(), { lod: 2 });
    const byName = new Map(meshes(live.object3d).map((mesh) => [mesh.name, mesh]));
    expect(byName.get('base')?.renderOrder).toBe(DRAW_ORDER.solid);
    expect(byName.get('dome')?.renderOrder).toBe(DRAW_ORDER.shell);
    expect(byName.get('cell0')?.renderOrder).toBe(DRAW_ORDER.glow);
    const halos = createEmitterHalos(live, 'light');
    for (const sprite of halos.sprites) expect(sprite.renderOrder).toBe(DRAW_ORDER.halo);
    halos.dispose();
    live.dispose();
  });

  it('keep the layer order on instanced static parts', () => {
    const set = createSceneModelSet({ instancing: true });
    const first = set.createSceneModel(domeSpec(), { lod: 2 });
    const second = set.createSceneModel(domeSpec(), { lod: 2 });
    set.object3d.add(first.object3d, second.object3d);
    set.updateInstances();
    const instanced = new Map(meshes(set.object3d).map((mesh) => [mesh.name, mesh]));
    expect(instanced.get('dev.test.dome-light:dome')?.renderOrder).toBe(DRAW_ORDER.shell);
    expect(instanced.get('dev.test.dome-light:base')?.renderOrder).toBe(DRAW_ORDER.solid);
    set.dispose();
  });

  it('keep a lit level cell see-through without writing depth', () => {
    const live = createSceneModel(domeSpec(), { lod: 2 });
    const cell = live.object3d.getObjectByName('cell0');
    if (!(cell instanceof Mesh)) throw new Error('no cell');
    live.setSignals({ level: 1 });
    expect(cell.material).toMatchObject({ opacity: 1, transparent: true, depthWrite: false });
    live.dispose();
  });

  it('keep the layer order when the map merges static model meshes', () => {
    const model = buildModel(domeSpec(), { lod: 2 });
    const frame = new Group();
    frame.add(model.group);
    const target = new Group();
    mergeStatics(target, [model.group], frame);
    const orders = meshes(target).map((mesh) => mesh.renderOrder);
    expect(new Set(orders)).toEqual(new Set([DRAW_ORDER.solid, DRAW_ORDER.shell, DRAW_ORDER.glow]));
    model.dispose();
  });
});
