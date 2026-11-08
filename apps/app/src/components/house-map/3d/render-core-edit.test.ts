import { describe, expect, it, vi } from 'vitest';
import { Group, PerspectiveCamera } from 'three';
import type { RenderFloor } from '../render-scene';
import { dragFamilyOf, editDrags } from './edit/edit-drags';
import type { GizmoBreakpoint } from './edit/gizmo';
import type { ScreenBounds } from './edit/pointer-scene';
import type { CameraView, PickTargets } from './render-core-orbit';
import type { ScreenMarks } from './render-core-marks';
import { EDIT, PHONE, gizmoView } from './edit/gizmo-fixture';
import { gizmoHandleId, gizmoLayout } from './edit/gizmo-handles';
import { NO_YIELD, type OverlayScene, type YieldZones } from './edit/overlay-model';
import { EditingUnavailableError } from './edit/pointer-scene';
import { HandleDragUnavailableError } from './edit/sessions-factory';
import type { EditEvent, EditOverlay } from './map-3d-edit-protocol';
import type { PointerSample } from './render-core-gestures';
import { EditStage, type EditStageSource, type StageEdit } from './render-core-edit';
import { ObjectsLayer, type ObjectPreview } from './render-core-objects';
import type { SceneObjectModel, SceneObjectModelSet } from './scene-objects';

const VIEW = gizmoView({ id: 'table', mode: 'move', look: 'top' });

const FLOOR: RenderFloor = {
  id: 'f1',
  name: 'Ground',
  level: 0,
  elevation: 0,
  ceilingHeight: 2.6,
  bounds: null,
  rooms: [],
  walls: [],
  openings: [],
  objects: [],
  placements: [],
  carpets: [],
  markers: [],
  measures: [],
  vacuum: null,
};

const CORNER: EditOverlay['handles'][number] = {
  id: 'corner-1',
  kind: 'point',
  at: { x: 2, y: 2, height: 0 },
  surface: { kind: 'ground' },
  target: { kind: 'room-corner', roomId: 'r1', index: 0 },
};

const EDITED: StageEdit = {
  overlay: VIEW.overlay,
  floor: FLOOR,
  edit: EDIT,
  committed: null,
  scan: null,
};

interface Rig {
  readonly stage: EditStage;
  readonly painted: (OverlayScene | null)[];
  readonly yields: YieldZones[];
  readonly requestRender: ReturnType<typeof vi.fn>;
}

function cameraOf(view: typeof VIEW): PerspectiveCamera {
  const { camera } = view;
  if (!(camera instanceof PerspectiveCamera))
    throw new Error('The fixture camera is not perspective');
  return camera;
}

const NO_MARKS: ScreenMarks = { width: 390, height: 844, labels: [], chips: [], robot: null };

const SOURCE: Omit<EditStageSource, 'onEdit' | 'onYield' | 'requestRender'> = {
  breakpoint: (): GizmoBreakpoint => 'phone',
  camera: (): PerspectiveCamera => cameraOf(VIEW),
  bounds: (): ScreenBounds => VIEW.bounds,
  viewport: (): CameraView => PHONE,
  steer: vi.fn(),
  targets: (): PickTargets => ({ floor: null, walls: null, ranges: [] }),
  look: (): null => null,
  items: (): null => null,
};

function rig(onEdit?: EditStageSource['onEdit']): Rig {
  const painted: (OverlayScene | null)[] = [];
  const yields: YieldZones[] = [];
  const requestRender = vi.fn();
  const stage = new EditStage({
    ...SOURCE,
    onEdit,
    onYield: (zones): void => {
      yields.push(zones);
    },
    requestRender,
  });
  stage.setPainter({
    paint: (scene): void => {
      painted.push(scene);
    },
  });
  return { stage, painted, yields, requestRender };
}

describe('the edit stage with no overlay', () => {
  it('paints nothing, reports no yield and claims no pointer', () => {
    const { stage, painted, yields } = rig(vi.fn());
    stage.setInteractive(true);
    stage.set(null);
    stage.paint(cameraOf(VIEW), NO_MARKS);
    expect(painted.every((scene) => scene === null)).toBe(true);
    expect(yields).toEqual([]);
    expect(stage.pointer).toBeNull();
  });
});

describe('the edit stage', () => {
  it('paints the gizmo for a set edit and clears it with the yield on clear', () => {
    const { stage, painted, yields } = rig();
    stage.set(EDITED);
    stage.paint(cameraOf(VIEW), NO_MARKS);
    expect(painted.at(-1)?.handles.length).toBeGreaterThan(0);
    expect(yields.at(-1)?.discs.length).toBeGreaterThan(0);
    stage.set(null);
    stage.paint(cameraOf(VIEW), NO_MARKS);
    expect(painted.at(-1)).toBeNull();
    expect(yields.at(-1)).toEqual(NO_YIELD);
  });

  it('draws without claiming the pointer until editing is turned on', () => {
    const { stage } = rig(vi.fn());
    stage.set(EDITED);
    expect(stage.pointer).toBeNull();
    stage.setInteractive(true);
    expect(stage.pointer).not.toBeNull();
    stage.set(null);
    expect(stage.pointer).toBeNull();
  });

  it('refuses interactive editing on a map created without an edit callback', () => {
    const { stage } = rig();
    stage.setInteractive(true);
    expect(() => {
      stage.set(EDITED);
    }).toThrow(EditingUnavailableError);
  });
});

describe('the drag session factory', () => {
  const overlay: EditOverlay = { ...VIEW.overlay, handles: [CORNER] };

  it('picks move for a body, gizmo for gizmo handles and shape for the other handle targets', () => {
    expect(dragFamilyOf(overlay, { kind: 'body', id: 'table' })).toBe('move');
    const axis = gizmoHandleId('axis-x', [0, 0]);
    expect(dragFamilyOf(overlay, { kind: 'handle', handleId: axis })).toBe('gizmo');
    expect(dragFamilyOf(overlay, { kind: 'handle', handleId: CORNER.id })).toBe('shape');
    const gizmoTarget = { ...CORNER, id: 'g', target: { kind: 'gizmo', id: 'table' } } as const;
    const withGizmo = { ...overlay, handles: [gizmoTarget] };
    expect(dragFamilyOf(withGizmo, { kind: 'handle', handleId: 'g' })).toBe('gizmo');
  });

  it('marks a started drag active and clears it when the drag ends', () => {
    const active = vi.fn();
    const start = editDrags({
      view: () => ({ ...VIEW, scan: null }),
      preview: vi.fn(),
      active,
    });
    const session = start({
      grab: { kind: 'body', id: 'table' },
      from: { x: 195, y: 422 },
      emit: vi.fn(),
    });
    expect(active).toHaveBeenLastCalledWith({ kind: 'body', id: 'table' });
    session.end();
    expect(active).toHaveBeenLastCalledWith(null);
  });

  it('fails loudly on a handle no session knows', () => {
    const start = editDrags({
      view: () => ({ ...VIEW, scan: null }),
      preview: vi.fn(),
      active: vi.fn(),
    });
    expect(() =>
      start({ grab: { kind: 'handle', handleId: 'nope' }, from: { x: 0, y: 0 }, emit: vi.fn() }),
    ).toThrow(HandleDragUnavailableError);
  });
});

function modelSet(): SceneObjectModelSet<SceneObjectModel> {
  return {
    object3d: new Group(),
    createSceneModel: () => ({ object3d: new Group(), dispose: () => undefined }),
    updateInstances: () => undefined,
    dispose: () => undefined,
  };
}

function sample(x: number, y: number): PointerSample {
  return { id: 1, x, y, button: 0, mouse: true, shift: false, alt: false };
}

interface Dragged {
  readonly stage: EditStage;
  readonly previews: (readonly ObjectPreview[])[];
  readonly seq: number;
}

function dragged(): Dragged {
  const objects = new ObjectsLayer<SceneObjectModel>({
    createModelSet: modelSet,
    onChange: vi.fn(),
  });
  const previews: (readonly ObjectPreview[])[] = [];
  vi.spyOn(objects, 'preview').mockImplementation((given) => {
    previews.push(given);
  });
  const events: EditEvent[] = [];
  const stage = new EditStage({
    ...SOURCE,
    items: (): ObjectsLayer<SceneObjectModel> => objects,
    onEdit: (event): void => {
      events.push(event);
    },
    onYield: vi.fn(),
    requestRender: vi.fn(),
  });
  stage.setInteractive(true);
  stage.set(EDITED);
  const handle = gizmoLayout(VIEW)?.handles.find((each) => each.kind === 'axis-x');
  const pointer = stage.pointer;
  if (handle === undefined || pointer === null) throw new Error('The fixture has no x arrow');
  const { x, y } = handle.screen;
  pointer.down(sample(x, y));
  pointer.move(sample(x + 30, y + 30));
  pointer.move(sample(x + 60, y + 60));
  pointer.up(sample(x + 60, y + 60));
  const committed = events.find((event) => event.type === 'move');
  if (committed === undefined) throw new Error('The drag committed no move');
  return { stage, previews, seq: committed.seq };
}

const lastOf = (previews: Dragged['previews']): readonly ObjectPreview[] | undefined =>
  previews.at(-1);

describe('the edit stage preview hold', () => {
  it('draws the dragged item at its previewed pose while it moves', () => {
    const { previews } = dragged();
    const moved = previews.find((each) => each.length > 0);
    expect(moved?.[0]?.id).toBe('table');
    expect(moved?.[0]?.lift).toBe(0);
    expect(moved?.[0]?.pose?.at.x).not.toBe(5);
  });

  it('holds the dropped pose until the floor of the committed edit arrives', () => {
    const { stage, previews, seq } = dragged();
    expect(lastOf(previews)?.[0]?.id).toBe('table');
    stage.set({ ...EDITED, overlay: { ...VIEW.overlay, snapping: false } });
    stage.set({ ...EDITED, edit: { ...EDIT }, committed: null });
    stage.set({ ...EDITED, edit: { ...EDIT }, committed: seq + 1 });
    stage.result(seq, true);
    expect(lastOf(previews)?.[0]?.id).toBe('table');
    stage.set({ ...EDITED, edit: { ...EDIT }, committed: seq });
    expect(lastOf(previews)).toEqual([]);
  });

  it('drops the hold at once and restores the pose when the edit fails', () => {
    const { stage, previews, seq } = dragged();
    stage.result(seq + 1, false);
    expect(lastOf(previews)?.[0]?.id).toBe('table');
    stage.result(seq, false);
    expect(lastOf(previews)).toEqual([]);
  });

  it('drops the hold when editing stops', () => {
    const { stage, previews } = dragged();
    stage.set(null);
    expect(lastOf(previews)).toEqual([]);
  });

  it('never touches the objects when nothing is dragged', () => {
    const objects = new ObjectsLayer<SceneObjectModel>({
      createModelSet: modelSet,
      onChange: vi.fn(),
    });
    const preview = vi.spyOn(objects, 'preview');
    const stage = new EditStage({
      ...SOURCE,
      items: (): ObjectsLayer<SceneObjectModel> => objects,
      onEdit: vi.fn(),
      onYield: vi.fn(),
      requestRender: vi.fn(),
    });
    stage.setInteractive(true);
    stage.set(EDITED);
    stage.result(3, false);
    stage.set({ ...EDITED, committed: 3 });
    stage.set(null);
    expect(preview).not.toHaveBeenCalled();
  });
});
