import { describe, expect, it, vi, type Mock } from 'vitest';
import { floorOf, placement } from '../lighting-fixture';
import { EDIT, gizmoView } from './edit/gizmo-fixture';
import type { EditOverlay } from './map-3d-edit-protocol';
import { Map3dSession, type SceneRenderer } from './map-3d-session';
import type { ScanPlacementWire } from './map-3d-protocol';
import type { StageEdit } from './render-core-edit';

const FLOOR = floorOf([placement('lamp', 2, 2)]);

const OVERLAY: EditOverlay = gizmoView({ id: 'sofa', mode: 'move' }).overlay;

interface Fake {
  readonly renderer: SceneRenderer;
  readonly setEdit: Mock<(edit: StageEdit | null) => void>;
  readonly editResult: Mock<(seq: number, accepted: boolean) => void>;
}

function fake(): Fake {
  const setEdit = vi.fn<(edit: StageEdit | null) => void>();
  const editResult = vi.fn<(seq: number, accepted: boolean) => void>();
  const renderer: SceneRenderer = {
    objects: null,
    live: { setFloor: vi.fn(), setLive: vi.fn() },
    realistic: {
      setScan: vi.fn(),
      setPlacement: vi.fn(),
      setBand: vi.fn(),
      setFloor: vi.fn(),
      setLighting: vi.fn(),
    },
    setGeometry: vi.fn(),
    setPose: vi.fn(),
    setLiveTrail: vi.fn(),
    setPreset: vi.fn(),
    setActive: vi.fn(),
    setEdit,
    editResult,
    resize: vi.fn(),
    dispose: vi.fn(),
  };
  return { renderer, setEdit, editResult };
}

function loaded(): Fake & { readonly session: Map3dSession } {
  const made = fake();
  const session = new Map3dSession(made.renderer);
  session.loadScene('home:1', 'home_map', JSON.stringify(FLOOR));
  return { ...made, session };
}

function lastEdit(spy: Fake['setEdit']): StageEdit | null {
  const call = spy.mock.calls.at(-1);
  if (call === undefined) throw new Error('setEdit was never called');
  return call[0];
}

describe('the 3D map session with no edit overlay', () => {
  it('never hands the scene an edit while nothing is being edited', () => {
    const { setEdit, session } = loaded();
    session.setTheme('light');
    session.setScanPlacement({ tx: 0, ty: 0, tz: 0, yawDeg: 0, scale: 1, opacity: 1 });
    expect(setEdit.mock.calls.every(([edit]) => edit === null)).toBe(true);
  });
});

describe('the 3D map session edit wiring', () => {
  it('routes the overlay with the edit floor and the scene floor into the scene', () => {
    const { setEdit, session } = loaded();
    session.setEditFloor('f:1', JSON.stringify(EDIT), null);
    expect(lastEdit(setEdit)).toBeNull();
    session.setEdit(JSON.stringify(OVERLAY));
    const edit = lastEdit(setEdit);
    expect(edit?.overlay).toEqual(OVERLAY);
    expect(edit?.edit).toEqual(EDIT);
    expect(edit?.floor.id).toBe(FLOOR.id);
    expect(edit?.scan).toBeNull();
  });

  it('waits for the scene floor before editing', () => {
    const made = fake();
    const session = new Map3dSession(made.renderer);
    session.setEditFloor('f:1', JSON.stringify(EDIT), null);
    session.setEdit(JSON.stringify(OVERLAY));
    expect(made.setEdit.mock.calls.every(([edit]) => edit === null)).toBe(true);
    session.loadScene('home:1', 'home_map', JSON.stringify(FLOOR));
    expect(lastEdit(made.setEdit)?.overlay).toEqual(OVERLAY);
  });

  it('carries the scan placement without its opacity into the edit', () => {
    const { setEdit, session } = loaded();
    session.setEditFloor('f:1', JSON.stringify(EDIT), null);
    session.setEdit(JSON.stringify(OVERLAY));
    const wire: ScanPlacementWire = { tx: 1, ty: 2, tz: 0.1, yawDeg: 15, scale: 1.2, opacity: 0.5 };
    session.setScanPlacement(wire);
    expect(lastEdit(setEdit)?.scan).toEqual({ tx: 1, ty: 2, tz: 0.1, yawDeg: 15, scale: 1.2 });
    session.clearScan();
    expect(lastEdit(setEdit)?.scan).toBeNull();
  });

  it('keeps the parsed edit floor while its key stays the same', () => {
    const { setEdit, session } = loaded();
    session.setEditFloor('f:1', JSON.stringify(EDIT), null);
    session.setEdit(JSON.stringify(OVERLAY));
    const first = lastEdit(setEdit)?.edit;
    session.setEditFloor('f:1', JSON.stringify(EDIT), null);
    session.setEdit(JSON.stringify({ ...OVERLAY, snapping: false }));
    expect(lastEdit(setEdit)?.edit).toBe(first);
    session.setEditFloor('f:2', JSON.stringify(EDIT), null);
    expect(lastEdit(setEdit)?.edit).not.toBe(first);
  });

  it('hands the scene the seq of the edit each floor commits', () => {
    const { setEdit, session } = loaded();
    session.setEditFloor('f:1', JSON.stringify(EDIT), null);
    session.setEdit(JSON.stringify(OVERLAY));
    expect(lastEdit(setEdit)?.committed).toBeNull();
    session.setEditFloor('f:2', JSON.stringify(EDIT), 6);
    expect(lastEdit(setEdit)?.committed).toBe(6);
    session.setEdit(JSON.stringify({ ...OVERLAY, snapping: false }));
    expect(lastEdit(setEdit)?.committed).toBe(6);
  });

  it('clears the overlay and the edit floor on clearEdit', () => {
    const { setEdit, session } = loaded();
    session.setEditFloor('f:1', JSON.stringify(EDIT), null);
    session.setEdit(JSON.stringify(OVERLAY));
    session.clearEdit();
    expect(lastEdit(setEdit)).toBeNull();
    session.setEdit(JSON.stringify(OVERLAY));
    expect(lastEdit(setEdit)).toBeNull();
  });

  it('passes edit results through to the scene', () => {
    const { editResult, session } = loaded();
    session.editResult(4, false);
    expect(editResult).toHaveBeenCalledWith(4, false);
  });

  it('rejects an overlay that does not match the strict wire shape', () => {
    const { session } = loaded();
    expect(() => {
      session.setEdit(JSON.stringify({ ...OVERLAY, extra: true }));
    }).toThrow();
    expect(() => {
      session.setEditFloor('f:1', JSON.stringify({ ...EDIT, boxes: 1 }), null);
    }).toThrow();
  });
});
