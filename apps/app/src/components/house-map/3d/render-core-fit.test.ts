import { Vector3, type PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { buildSceneGeometry, type SceneFrame } from './vacuum-geometry';
import { scrubbedScene, vacuumInput } from './scene-input-fixture';
import {
  CAMERA_PRESET_IDS,
  NO_INSETS,
  buildCamera,
  presetOrbit,
  type CameraPresetId,
  type CameraView,
  type OrbitState,
  type PickTargets,
  type ViewInsets,
} from './render-core-orbit';
import { fitToCorners, revealShift, steerOrbit, type CameraSteer } from './render-core-fit';
import type { RenderFloor } from '../render-scene';
import { CAMERAS, EDIT, PHONE, gizmoView } from './edit/gizmo-fixture';
import type { GizmoView } from './edit/gizmo';
import type { OverlayScene } from './edit/overlay-model';
import type { EditEvent } from './map-3d-edit-protocol';
import { EditStage, type StageEdit } from './render-core-edit';
import type { ScreenMarks } from './render-core-marks';

const geometry = buildSceneGeometry(vacuumInput(scrubbedScene));

const PHONE_FULL_SCREEN: CameraView = { width: 396, height: 830, insets: NO_INSETS };

const VIEWPORTS: Readonly<Record<string, CameraView>> = {
  'phone full screen': PHONE_FULL_SCREEN,
  'very tall strip': { width: 412, height: 4284, insets: NO_INSETS },
  'tablet full screen': { width: 804, height: 1100, insets: NO_INSETS },
  'wide hero': { width: 1180, height: 336, insets: NO_INSETS },
};

const FIT_MARGIN = 0.9;

const TIGHT_FIT = 0.8;

interface Fitted {
  readonly fitted: OrbitState;
  readonly camera: PerspectiveCamera;
}

function fittedCamera(preset: CameraPresetId, view: CameraView): Fitted {
  const start = presetOrbit(preset, geometry.frame, view.width / view.height);
  const fitted = fitToCorners(start, geometry.extent, view, geometry.frame);
  return { fitted, camera: buildCamera(fitted, view, geometry.frame) };
}

function projectedExtent(preset: CameraPresetId, view: CameraView): readonly Vector3[] {
  const { camera } = fittedCamera(preset, view);
  return geometry.extent.map((corner) => new Vector3(...corner).project(camera));
}

function pixelRows(points: readonly Vector3[], view: CameraView): readonly number[] {
  return points.map((point) => ((1 - point.y) / 2) * view.height);
}

describe('top camera fit', () => {
  it.each(Object.entries(VIEWPORTS))(
    'shows the whole home in front of the camera, tightly framed, on a %s',
    (_, viewport) => {
      const points = projectedExtent('top', viewport);
      for (const point of points) {
        expect(Math.abs(point.x)).toBeLessThanOrEqual(FIT_MARGIN + 1e-6);
        expect(Math.abs(point.y)).toBeLessThanOrEqual(FIT_MARGIN + 1e-6);
        expect(point.z).toBeGreaterThan(-1);
        expect(point.z).toBeLessThan(1);
      }
      const reach = Math.max(
        ...points.map((point) => Math.max(Math.abs(point.x), Math.abs(point.y))),
      );
      expect(reach).toBeGreaterThan(TIGHT_FIT);
    },
  );

  it('keeps the north of the home at the top of the screen like the angled view', () => {
    const viewport = PHONE_FULL_SCREEN;
    const orbit = presetOrbit('top', geometry.frame, viewport.width / viewport.height);
    const camera = buildCamera(orbit, viewport, geometry.frame);
    const [x, y, z] = geometry.frame.centre;
    const north = new Vector3(x, y, z - 1).project(camera);
    const south = new Vector3(x, y, z + 1).project(camera);
    expect(north.y).toBeGreaterThan(south.y);
    expect(Math.abs(north.x - south.x)).toBeLessThan(0.01);
  });

  it.each([
    [0, [0, -1]],
    [Math.PI / 2, [-1, 0]],
    [Math.PI, [0, 1]],
    [-Math.PI / 2, [1, 0]],
  ] as const)('looks straight down without flipping at azimuth %f', (azimuth, [upX, upZ]) => {
    const viewport = PHONE_FULL_SCREEN;
    const orbit = {
      ...presetOrbit('top', geometry.frame, viewport.width / viewport.height),
      azimuth,
    };
    expect(orbit.polar).toBe(0);
    const camera = buildCamera(orbit, viewport, geometry.frame);
    const forward = camera.getWorldDirection(new Vector3());
    expect(forward.x).toBeCloseTo(0, 9);
    expect(forward.y).toBeCloseTo(-1, 9);
    expect(forward.z).toBeCloseTo(0, 9);
    const [x, y, z] = geometry.frame.centre;
    const centre = new Vector3(x, y, z).project(camera);
    const ahead = new Vector3(x + upX, y, z + upZ).project(camera);
    const aside = new Vector3(x - upZ, y, z + upX).project(camera);
    for (const point of [centre, ahead, aside]) {
      expect(Number.isFinite(point.x) && Number.isFinite(point.y)).toBe(true);
    }
    expect(ahead.y).toBeGreaterThan(centre.y);
    expect(Math.abs(ahead.x - centre.x)).toBeLessThan(1e-9);
    expect(aside.x).toBeGreaterThan(centre.x);
    expect(Math.abs(aside.y - centre.y)).toBeLessThan(1e-9);
  });

  it('keeps the screen turning smoothly as the top view turns around', () => {
    const viewport = PHONE_FULL_SCREEN;
    const start = presetOrbit('top', geometry.frame, viewport.width / viewport.height);
    const [x, y, z] = geometry.frame.centre;
    const angles = Array.from({ length: 33 }, (_, step) => (step * Math.PI) / 16);
    const headings = angles.map((azimuth) => {
      const camera = buildCamera({ ...start, azimuth }, viewport, geometry.frame);
      const centre = new Vector3(x, y, z).project(camera);
      const north = new Vector3(x, y, z - 1).project(camera);
      return Math.atan2(
        (north.y - centre.y) * viewport.height,
        (north.x - centre.x) * viewport.width,
      );
    });
    headings.slice(1).forEach((heading, index) => {
      const previous = headings[index] ?? heading;
      const turn = Math.atan2(Math.sin(heading - previous), Math.cos(heading - previous));
      expect(Math.abs(turn)).toBeCloseTo(Math.PI / 16, 6);
    });
  });
});

describe('angled camera fit', () => {
  it('centres the home in a phone full screen and fills its width', () => {
    const points = projectedExtent('angled', PHONE_FULL_SCREEN);
    const xs = points.map((point) => point.x);
    const ys = points.map((point) => point.y);
    expect(Math.abs(Math.min(...xs) + Math.max(...xs))).toBeLessThan(0.05);
    expect(Math.abs(Math.min(...ys) + Math.max(...ys))).toBeLessThan(0.05);
    expect(Math.max(...xs.map(Math.abs), ...ys.map(Math.abs))).toBeGreaterThan(TIGHT_FIT + 0.08);
  });
});

const PHONE_BARS: ViewInsets = { top: 64, bottom: 120 };

const TABLET_BARS: ViewInsets = { top: 72, bottom: 64 };

const BARRED: Readonly<Record<string, CameraView>> = {
  'phone stage under its bars': { width: 412, height: 480, insets: PHONE_BARS },
  'tablet split under its bars': { width: 884, height: 560, insets: TABLET_BARS },
  'wide hero under its bars': { width: 1180, height: 336, insets: { top: 56, bottom: 56 } },
};

const CASES = Object.entries(BARRED).flatMap(([name, view]) =>
  CAMERA_PRESET_IDS.map((preset) => [`${preset} on a ${name}`, preset, view] as const),
);

describe('camera fit between the stage bars', () => {
  it.each(CASES)('keeps every corner between the bars for %s', (_, preset, view) => {
    const points = projectedExtent(preset, view);
    const rows = pixelRows(points, view);
    for (const row of rows) {
      expect(row).toBeGreaterThanOrEqual(view.insets.top);
      expect(row).toBeLessThanOrEqual(view.height - view.insets.bottom);
    }
    for (const point of points) {
      expect(Math.abs(point.x)).toBeLessThanOrEqual(FIT_MARGIN + 1e-6);
      expect(point.z).toBeLessThan(1);
    }
  });

  it.each(CASES)('puts the framed plan centre at the visible centre for %s', (_, preset, view) => {
    const rows = pixelRows(projectedExtent(preset, view), view);
    const middle = (Math.min(...rows) + Math.max(...rows)) / 2;
    const visible = view.height - view.insets.top - view.insets.bottom;
    expect(Math.abs(middle - (view.insets.top + visible / 2))).toBeLessThan(visible * 0.03);
  });

  it('aims the orbit target at the centre of the visible rectangle', () => {
    const view = BARRED['phone stage under its bars'];
    if (view === undefined) throw new Error('missing case');
    const { fitted, camera } = fittedCamera('angled', view);
    const target = new Vector3(...fitted.target).project(camera);
    const row = ((1 - target.y) / 2) * view.height;
    expect(row).toBeCloseTo(view.insets.top + (view.height - 64 - 120) / 2, 6);
    expect(target.x).toBeCloseTo(0, 6);
  });

  it('frames exactly as before when the bars take no room', () => {
    for (const preset of CAMERA_PRESET_IDS) {
      const plain = fittedCamera(preset, PHONE_FULL_SCREEN);
      const zero = fittedCamera(preset, { ...PHONE_FULL_SCREEN, insets: { top: 0, bottom: 0 } });
      expect(zero.fitted).toEqual(plain.fitted);
      expect(zero.camera.projectionMatrix.elements).toEqual(plain.camera.projectionMatrix.elements);
      expect(plain.camera.view).toBeNull();
    }
  });

  it('ignores bars that leave no visible rectangle', () => {
    const view: CameraView = { width: 412, height: 100, insets: { top: 60, bottom: 60 } };
    const covered = fittedCamera('top', view);
    const open = fittedCamera('top', { ...view, insets: NO_INSETS });
    expect(covered.fitted).toEqual(open.fitted);
  });

  it('zooms out further when the bars take room', () => {
    const open = fittedCamera('top', { width: 412, height: 480, insets: NO_INSETS });
    const barred = fittedCamera('top', { width: 412, height: 480, insets: PHONE_BARS });
    expect(barred.fitted.distance).toBeGreaterThan(open.fitted.distance);
  });
});

const STAGE_VIEW = gizmoView({ id: 'table', mode: 'move', look: 'top' });

const STAGE_FLOOR: RenderFloor = {
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

const EDITED: StageEdit = {
  overlay: STAGE_VIEW.overlay,
  floor: STAGE_FLOOR,
  edit: EDIT,
  committed: null,
  scan: null,
};

const VIEW = STAGE_VIEW;

const NO_MARKS: ScreenMarks = { width: 390, height: 844, labels: [], chips: [], robot: null };

const STAGE_FRAME: SceneFrame = { centre: [5, 0, -3], radius: 8 };

interface Steered {
  readonly stage: EditStage;
  readonly steer: ReturnType<typeof vi.fn>;
  readonly painted: (OverlayScene | null)[];
  readonly anchors: Extract<EditEvent, { type: 'anchor' }>[];
  readonly paint: () => void;
}

function steeredRig(start: OrbitState): Steered {
  let orbit = start;
  const camera = (): PerspectiveCamera => buildCamera(orbit, PHONE, STAGE_FRAME);
  const anchors: Extract<EditEvent, { type: 'anchor' }>[] = [];
  const steer = vi.fn((given: CameraSteer) => {
    orbit = steerOrbit(orbit, given, { view: PHONE, frame: STAGE_FRAME });
  });
  const stage = new EditStage({
    breakpoint: (): 'phone' => 'phone',
    bounds: (): GizmoView['bounds'] => STAGE_VIEW.bounds,
    viewport: (): CameraView => PHONE,
    targets: (): PickTargets => ({ floor: null, walls: null, ranges: [] }),
    look: (): null => null,
    items: (): null => null,
    camera,
    steer,
    onEdit: (event): void => {
      if (event.type === 'anchor') anchors.push(event);
    },
    onYield: vi.fn(),
    requestRender: vi.fn(),
  });
  const painted: (OverlayScene | null)[] = [];
  stage.setPainter({
    paint: (scene): void => {
      painted.push(scene);
    },
  });
  stage.setInteractive(true);
  return {
    stage,
    steer,
    painted,
    anchors,
    paint: (): void => {
      stage.paint(camera(), NO_MARKS);
    },
  };
}

const AT_EDGE: OrbitState = { ...CAMERAS.top, target: [5.9, 0, -3] };

function inside(scene: OverlayScene | null | undefined): boolean {
  return (scene?.yieldTo.discs ?? []).every(
    (disc) =>
      disc.x - disc.r >= -0.5 && disc.x + disc.r <= PHONE.width + 0.5 && disc.y - disc.r >= -0.5,
  );
}

describe('the edit stage camera', () => {
  it('frames a frame request once per key, in Top when asked, and again once it was cleared', () => {
    const { stage, steer } = steeredRig(CAMERAS.angled);
    const bounds = { minX: 1, minY: 1, maxX: 4, maxY: 3 };
    const framed = {
      ...EDITED,
      overlay: { ...VIEW.overlay, frame: { key: 'draw', bounds, top: true } },
    };
    stage.set(framed);
    stage.set(framed);
    expect(steer).toHaveBeenCalledTimes(1);
    expect(steer).toHaveBeenLastCalledWith({
      kind: 'frame',
      corners: [
        [1, 0, -1],
        [4, 0, -1],
        [4, 0, -3],
        [1, 0, -3],
      ],
      top: true,
    });
    stage.set(EDITED);
    stage.set(framed);
    expect(steer).toHaveBeenCalledTimes(2);
  });

  it('pans once on select so every handle target is inside the stage', () => {
    const rig = steeredRig(AT_EDGE);
    rig.stage.set(EDITED);
    rig.paint();
    expect(inside(rig.painted.at(-1))).toBe(false);
    expect(rig.steer).toHaveBeenCalledTimes(1);
    expect(rig.steer.mock.calls[0]?.[0]).toMatchObject({ kind: 'shift' });
    rig.paint();
    expect(inside(rig.painted.at(-1))).toBe(true);
    rig.paint();
    expect(rig.steer).toHaveBeenCalledTimes(1);
  });

  it('keeps the wall holding the selected item uncut while it is selected', () => {
    const rig = steeredRig(CAMERAS.top);
    rig.stage.set(EDITED);
    expect(rig.stage.fullWalls.size).toBe(0);
    rig.stage.set({ ...EDITED, overlay: { ...VIEW.overlay, selection: ['tv'], gizmo: null } });
    expect([...rig.stage.fullWalls]).toEqual(['north']);
  });
});

describe('the edit stage anchor', () => {
  it('sends the selection rectangle on select, again only when it moves or the mode changes', () => {
    const rig = steeredRig(CAMERAS.top);
    rig.stage.set(EDITED);
    rig.paint();
    rig.paint();
    expect(rig.anchors).toHaveLength(1);
    const rect = rig.anchors[0]?.rect;
    expect(rect?.width).toBeGreaterThan(0);
    expect(rect?.height).toBeGreaterThan(0);
    const gizmo = VIEW.overlay.gizmo;
    if (gizmo === null) throw new Error('The fixture has no gizmo');
    rig.stage.set({ ...EDITED, overlay: { ...VIEW.overlay, gizmo: { ...gizmo, mode: 'rotate' } } });
    rig.paint();
    expect(rig.anchors).toHaveLength(2);
    expect(rig.anchors[1]?.rect).toEqual(rect);
    expect(rig.anchors[1]?.seq).toBeGreaterThan(rig.anchors[0]?.seq ?? Infinity);
    rig.stage.set({ ...EDITED, overlay: { ...VIEW.overlay, selection: [], gizmo: null } });
    rig.paint();
    expect(rig.anchors.at(-1)?.rect).toBeNull();
  });
});

describe('the reveal shift', () => {
  const stage = { left: 0, right: 400, top: 60, bottom: 700 };

  it('moves targets that cross an edge back inside and leaves inner ones alone', () => {
    expect(revealShift([{ x: 10, y: 300, r: 24 }], stage)).toEqual({ x: 14, y: 0 });
    expect(revealShift([{ x: 390, y: 80, r: 24 }], stage)).toEqual({ x: -14, y: 4 });
    expect(revealShift([{ x: 200, y: 300, r: 24 }], stage)).toEqual({ x: 0, y: 0 });
    expect(revealShift([], stage)).toEqual({ x: 0, y: 0 });
  });

  it('centres targets that are wider than the stage', () => {
    const wide = [
      { x: -100, y: 300, r: 24 },
      { x: 460, y: 300, r: 24 },
    ];
    expect(revealShift(wide, stage).x).toBeCloseTo(20, 9);
  });
});
