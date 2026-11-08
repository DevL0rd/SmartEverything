import { describe, expect, it } from 'vitest';
import type { HomeMapObject } from '@smarteverything/domain';
import { FLOOR_ID, SOFA_ID, floorWith, onlyObject, sofa, specOf } from '../tools/furniture-fixture';
import {
  NO_MODIFIERS,
  degreesText,
  dragLive,
  holdAt,
  liveOps,
  metresText,
  pinchLive,
  snapEngaged,
  wheelOps,
  type Hold,
  type Scene,
} from '../../../../components/house-map/edit/gestures';

const CHAIR_ID = '00000000-0000-4000-8000-0000000000c2';

function sceneOf(objects: Record<string, unknown>[] = [sofa()]): Scene {
  return {
    floor: floorWith(objects),
    specOf,
    metresPerPx: 0.01,
    nameOf: (id) => (id === CHAIR_ID ? 'Chair' : 'Sofa'),
  };
}

function theSofa(scene: Scene): HomeMapObject {
  return onlyObject(scene.floor);
}

function held(scene: Scene, point: { x: number; y: number }): Hold {
  const pick = holdAt(scene, theSofa(scene), point);
  if (pick.hold === null) throw new Error('nothing held');
  return pick.hold;
}

describe('picking what a press holds', () => {
  it('grabs the body of an object to move it and selects it', () => {
    const scene = sceneOf();
    const pick = holdAt(scene, null, { x: 2.1, y: 2.2 });
    expect(pick.select).toBe(SOFA_ID);
    expect(pick.hold?.grip.kind).toBe('move');
  });

  it('grabs a handle of the selected object before its body', () => {
    const scene = sceneOf();
    expect(held(scene, { x: 2, y: 3 }).grip).toEqual({ kind: 'resize', handle: 's' });
    expect(held(scene, { x: 2, y: 1 - 0.28 }).grip).toEqual({ kind: 'rotate' });
  });

  it('selects a locked object without holding it, so the drag pans the map', () => {
    const scene = sceneOf([sofa(true)]);
    const pick = holdAt(scene, null, { x: 2, y: 2 });
    expect(pick).toEqual({ select: SOFA_ID, hold: null });
  });

  it('holds nothing on empty map', () => {
    expect(holdAt(sceneOf(), null, { x: 4.5, y: 4.5 })).toEqual({ select: null, hold: null });
  });
});

describe('dragging a handle', () => {
  it('resizes one direction with the opposite edge anchored and a live label', () => {
    const scene = sceneOf();
    const live = dragLive(scene, held(scene, { x: 2, y: 3 }), { x: 2, y: 3.83 }, NO_MODIFIERS);
    expect(live.patch.params?.['width']).toBeCloseTo(2.8);
    expect(live.patch.at?.y).toBeCloseTo(2.4);
    expect(live.ghost.w).toBe(2);
    expect(live.labels.map((label) => label.text)).toEqual(['2.80 m']);
    expect(liveOps(FLOOR_ID, live)).toEqual([
      { op: 'update', kind: 'object', floorId: FLOOR_ID, id: SOFA_ID, patch: live.patch },
    ]);
  });

  it('Alt releases the grid snapping', () => {
    const scene = sceneOf();
    const modifiers = { ...NO_MODIFIERS, alt: true };
    const live = dragLive(scene, held(scene, { x: 2, y: 3 }), { x: 2, y: 3.83 }, modifiers);
    expect(live.patch.params?.['width']).toBeCloseTo(2.83);
  });

  it('stays inside the model range', () => {
    const scene = sceneOf();
    const live = dragLive(scene, held(scene, { x: 2, y: 3 }), { x: 2, y: 9 }, NO_MODIFIERS);
    expect(live.patch.params?.['width']).toBe(3);
  });

  it('Shift keeps proportions on a corner handle', () => {
    const scene = sceneOf();
    const hold = held(scene, { x: 2.45, y: 3 });
    expect(hold.grip).toEqual({ kind: 'resize', handle: 'se' });
    const free = dragLive(scene, hold, { x: 2.9, y: 3 }, NO_MODIFIERS);
    const kept = dragLive(scene, hold, { x: 2.9, y: 3 }, { ...NO_MODIFIERS, shift: true });
    expect(free.patch.params?.['width']).toBeCloseTo(2);
    expect(kept.patch.params?.['width']).toBeCloseTo(3);
  });

  it('rotates by 15 degree steps, free with the chip, Alt or a second finger', () => {
    const scene = sceneOf();
    const hold = held(scene, { x: 2, y: 0.72 });
    const pointer = { x: 2 + Math.cos(Math.PI / 18), y: 2 + Math.sin(Math.PI / 18) };
    expect(dragLive(scene, hold, pointer, NO_MODIFIERS).patch.rotation).toBe(105);
    const free = dragLive(scene, hold, pointer, { ...NO_MODIFIERS, free: true });
    expect(free.patch.rotation).toBeCloseTo(100);
    expect(dragLive(scene, hold, pointer, { ...NO_MODIFIERS, alt: true }).labels[0]?.text).toBe(
      '100°',
    );
  });
});

describe('dragging the body', () => {
  it('moves on the grid and shows the offset', () => {
    const scene = sceneOf();
    const hold = held(scene, { x: 2, y: 2 });
    const live = dragLive(scene, hold, { x: 2.43, y: 1.98 }, NO_MODIFIERS);
    expect(live.patch.at?.x).toBeCloseTo(2.4);
    expect(live.patch.at?.y).toBeCloseTo(2);
    expect(live.labels.map((label) => label.text)).toEqual(['0.40 m']);
    expect(live.snap).toBeNull();
    expect(live.target).toBeNull();
  });

  it('names the wall it snapped back to as the ring target', () => {
    const scene = sceneOf();
    const hold = held(scene, { x: 2, y: 2 });
    const live = dragLive(scene, hold, { x: 2, y: 0.53 }, NO_MODIFIERS);
    expect(live.labels.some((label) => label.text === 'snapped to the wall')).toBe(true);
    expect(live.target).toEqual({ kind: 'wall', from: { x: 0, y: 0 }, to: { x: 5, y: 0 } });
  });

  it('snaps to another object edge with a guide, a label and a snap tick', () => {
    const chair = { ...sofa(), id: CHAIR_ID, at: { x: 4, y: 2 } };
    const scene = sceneOf([sofa(), chair]);
    const hold = held(scene, { x: 2, y: 2 });
    const live = dragLive(scene, hold, { x: 3.15, y: 2.33 }, NO_MODIFIERS);
    expect(live.patch.at?.x).toBeCloseTo(3.1);
    expect(live.guides.length).toBeGreaterThan(0);
    expect(live.labels.some((label) => label.text === 'snaps to the chair')).toBe(true);
    expect(snapEngaged(null, live)).toBe(true);
    expect(snapEngaged(live, live)).toBe(false);
    expect(live.target).toMatchObject({
      kind: 'object',
      id: CHAIR_ID,
      box: { at: { x: 4, y: 2 } },
    });
    const freed = dragLive(scene, hold, { x: 3.15, y: 2.33 }, { ...NO_MODIFIERS, alt: true });
    expect(freed.guides).toEqual([]);
    expect(freed.target).toBeNull();
    expect(freed.patch.at?.x).toBeCloseTo(3.15);
  });
});

describe('two fingers and the wheel', () => {
  it('pinch scales the size parameters and twist rotates in steps', () => {
    const scene = sceneOf();
    const live = pinchLive(scene, theSofa(scene), { scale: 1.2, twistDeg: 20 }, NO_MODIFIERS);
    expect(live.patch.params?.['width']).toBeCloseTo(2.4);
    expect(live.patch.rotation).toBe(15);
    expect(live.labels[0]?.text).toBe('2.40 × 0.90 m · 15°');
    const free = pinchLive(
      scene,
      theSofa(scene),
      { scale: 1, twistDeg: 20 },
      {
        ...NO_MODIFIERS,
        free: true,
      },
    );
    expect(free.patch.rotation).toBeCloseTo(20);
  });

  it('Alt plus wheel rotates the selection by the step, otherwise nothing', () => {
    const scene = sceneOf();
    const object = theSofa(scene);
    const alt = { ...NO_MODIFIERS, alt: true };
    expect(wheelOps(FLOOR_ID, object, 40, alt)).toEqual([
      { op: 'update', kind: 'object', floorId: FLOOR_ID, id: SOFA_ID, patch: { rotation: 15 } },
    ]);
    expect(wheelOps(FLOOR_ID, object, -40, alt)[0]).toMatchObject({ patch: { rotation: 345 } });
    expect(wheelOps(FLOOR_ID, object, 40, NO_MODIFIERS)).toEqual([]);
    expect(wheelOps(FLOOR_ID, { ...object, locked: true }, 40, alt)).toEqual([]);
    expect(wheelOps(FLOOR_ID, null, 40, alt)).toEqual([]);
  });

  it('sends nothing when nothing is live', () => {
    expect(liveOps(FLOOR_ID, null)).toEqual([]);
  });
});

describe('label text', () => {
  it('writes metres with a real minus and degrees in a full turn', () => {
    expect(metresText(-0.6)).toBe('−0.60 m');
    expect(metresText(2.8)).toBe('2.80 m');
    expect(degreesText(-15)).toBe('345°');
  });
});
