import { describe, expect, it } from 'vitest';
import {
  canUndo,
  initialZoneState,
  isDirty,
  zoneReducer,
  type ZoneAction,
  type ZoneState,
} from './zone-reducer';
import { cleanZonesOf, countsOf, restrictedOf } from './zone-shapes';

const bounds = { minX: 0, minY: 0, maxX: 10, maxY: 8 };

const rectPoints = (x1: number, y1: number, x2: number, y2: number): { x: number; y: number }[] => [
  { x: x1, y: y1 },
  { x: x2, y: y1 },
  { x: x2, y: y2 },
  { x: x1, y: y2 },
];

const zones = [{ id: 1, kind: 'no_go', points: rectPoints(1, 1, 3, 2) }];

function run(state: ZoneState, ...actions: readonly ZoneAction[]): ZoneState {
  return actions.reduce(zoneReducer, state);
}

const start = initialZoneState(zones, '7:current');

describe('zone editing', () => {
  it('adds up to five clean zones and then refuses', () => {
    const add: ZoneAction = { type: 'add', bounds };
    const five = run(start, add, add, add, add, add);
    expect(countsOf(five.present).clean).toBe(5);
    const sixth = zoneReducer(five, add);
    expect(sixth).toBe(five);
    expect(cleanZonesOf(five.present)).toHaveLength(5);
  });

  it('adds up to ten restricted areas in total', () => {
    const asNoGo = zoneReducer(start, { type: 'mode', mode: 'no_go' });
    const full = run(
      asNoGo,
      ...Array.from({ length: 12 }, () => ({ type: 'add', bounds }) as const),
    );
    expect(countsOf(full.present).restricted).toBe(10);
    const asWall = zoneReducer(full, { type: 'mode', mode: 'wall' });
    expect(zoneReducer(asWall, { type: 'add', bounds })).toBe(asWall);
  });

  it('selects the new shape and removes it again', () => {
    const added = zoneReducer(start, { type: 'add', bounds });
    expect(added.selected).toBe(2);
    const gone = zoneReducer(added, { type: 'remove', key: 2 });
    expect(gone.selected).toBeNull();
    expect(gone.present).toEqual(start.present);
  });

  it('undoes each edit one step at a time', () => {
    const added = zoneReducer(start, { type: 'add', bounds });
    const nudged = zoneReducer(added, { type: 'nudge', key: 2, step: { x: 0, y: 0.1 }, bounds });
    expect(canUndo(nudged)).toBe(true);
    const once = zoneReducer(nudged, { type: 'undo' });
    expect(once.present).toEqual(added.present);
    const twice = zoneReducer(once, { type: 'undo' });
    expect(twice.present).toEqual(start.present);
    expect(canUndo(twice)).toBe(false);
    expect(zoneReducer(twice, { type: 'undo' })).toBe(twice);
  });

  it('records a whole drag as one undo step', () => {
    const grabbed = zoneReducer(start, {
      type: 'grab',
      key: 1,
      handle: null,
      start: { x: 2, y: 1.5 },
    });
    const dragged = run(
      grabbed,
      { type: 'drag', point: { x: 3, y: 2.5 }, bounds },
      { type: 'drag', point: { x: 4, y: 3.5 }, bounds },
      { type: 'release' },
    );
    expect(dragged.past).toHaveLength(1);
    expect(dragged.present[0]).toMatchObject({ rect: { x1: 3, y1: 3, x2: 5, y2: 4 } });
    expect(zoneReducer(dragged, { type: 'undo' }).present).toEqual(start.present);
  });

  it('does not record a tap that moved nothing', () => {
    const tapped = run(
      start,
      { type: 'grab', key: 1, handle: null, start: { x: 2, y: 1.5 } },
      { type: 'release' },
    );
    expect(tapped.past).toHaveLength(0);
    expect(tapped.selected).toBe(1);
  });

  it('resizes through a handle', () => {
    const resized = run(
      start,
      { type: 'grab', key: 1, handle: 'ne', start: { x: 3, y: 2 } },
      { type: 'drag', point: { x: 6, y: 5 }, bounds },
      { type: 'release' },
    );
    expect(resized.present[0]).toMatchObject({ rect: { x1: 1, y1: 1, x2: 6, y2: 5 } });
  });
});

describe('zone saving', () => {
  it('is dirty after an edit and clean after saving', () => {
    const edited = zoneReducer(zoneReducer(start, { type: 'mode', mode: 'no_go' }), {
      type: 'add',
      bounds,
    });
    expect(isDirty(edited)).toBe(true);
    const saved = zoneReducer(edited, { type: 'saved', previous: restrictedOf(start.present) });
    expect(isDirty(saved)).toBe(false);
    expect(saved.previousSaved).toEqual(restrictedOf(start.present));
  });

  it('keeps clean zones local: drawing one is not a change to save', () => {
    expect(isDirty(zoneReducer(start, { type: 'add', bounds }))).toBe(false);
  });

  it('restores the previous areas and keeps the clean zones', () => {
    const asNoGo = zoneReducer(start, { type: 'mode', mode: 'no_go' });
    const edited = run(
      zoneReducer(start, { type: 'add', bounds }),
      { type: 'mode', mode: 'no_go' },
      { type: 'add', bounds },
    );
    const saved = zoneReducer(edited, { type: 'saved', previous: restrictedOf(start.present) });
    const back = zoneReducer(saved, { type: 'restored', restricted: restrictedOf(start.present) });
    expect(countsOf(back.present)).toEqual({ clean: 1, restricted: 1 });
    expect(isDirty(back)).toBe(false);
    expect(back.previousSaved).toBeNull();
    expect(asNoGo.mode).toBe('no_go');
  });
});

describe('zone sync', () => {
  const next = [{ id: 1, kind: 'no_go', points: rectPoints(5, 5, 7, 6) }];

  it('ignores the same map version', () => {
    expect(zoneReducer(start, { type: 'sync', zones: next, version: '7:current' })).toBe(start);
  });

  it('takes the new map areas when nothing is being edited and keeps clean zones', () => {
    const drawn = zoneReducer(start, { type: 'add', bounds });
    const synced = zoneReducer(drawn, { type: 'sync', zones: next, version: '8:current' });
    expect(cleanZonesOf(synced.present)).toHaveLength(1);
    expect(restrictedOf(synced.present).noGo[0]?.[0]).toEqual({ x: 5, y: 5 });
    expect(synced.version).toBe('8:current');
  });

  it('keeps unsaved edits when a newer map arrives', () => {
    const edited = run(start, { type: 'mode', mode: 'wall' }, { type: 'add', bounds });
    const synced = zoneReducer(edited, { type: 'sync', zones: next, version: '8:current' });
    expect(synced.present).toEqual(edited.present);
    expect(isDirty(synced)).toBe(true);
  });
});
