import type { VacuumPoint } from '@smarteverything/domain';
import type {
  EditEvent,
  EditGhost,
  EditOverlay,
  EditShape,
} from '../../../../../components/house-map/3d/map-3d-edit-protocol';
import { HIT_RADIUS_PX } from '../../../../../components/house-map/edit/radii';
import { handlesOf, hitShape, shapePoints, type Bounds, type HandleId } from './zone-geometry';
import type { ZoneAction } from './zone-reducer';
import type { ZoneView } from './zone-frame';
import { cleanShapes, type Draft, type Shape } from './zone-shapes';

type Tone = EditGhost['tone'];

type EditHandle = EditOverlay['handles'][number];

const TONES: Readonly<Record<Shape['kind'], Tone>> = {
  clean: 'accent',
  no_go: 'danger',
  no_mop: 'warn',
  wall: 'danger',
};

const shapeId = (shape: Shape): string => `zone:${String(shape.key)}`;

const handleIdOf = (shape: Shape, handle: HandleId): string => `${shapeId(shape)}:${handle}`;

const onGround = (point: VacuumPoint): { x: number; y: number; height: number } => ({
  x: point.x,
  y: point.y,
  height: 0,
});

function housePoints(shape: Shape, view: ZoneView): readonly VacuumPoint[] {
  return shapePoints(shape).map(view.toView);
}

function sceneShape(shape: Shape, view: ZoneView): EditShape {
  const [from, to] = housePoints(shape, view);
  if (shape.form === 'wall' && from !== undefined && to !== undefined) {
    return { kind: 'line', id: shapeId(shape), from, to };
  }
  return { kind: 'ring', id: shapeId(shape), points: [...housePoints(shape, view)] };
}

function ghostOf(shape: Shape, view: ZoneView, selected: boolean): readonly EditGhost[] {
  const points = housePoints(shape, view).map(onGround);
  const tone = TONES[shape.kind];
  if (shape.form === 'wall') return [{ shape: 'polyline', points, tone }];
  const outline = [...points, ...points.slice(0, 1)];
  const edge: EditGhost = { shape: 'polyline', points: outline, tone: selected ? 'accent' : tone };
  return [{ shape: 'polygon', points, tone }, edge];
}

function cornerIndex(shape: Shape, point: VacuumPoint): number {
  return shapePoints(shape).findIndex((corner) => corner.x === point.x && corner.y === point.y);
}

function handlesFor(shape: Shape, view: ZoneView): readonly EditHandle[] {
  return handlesOf(shape).map((handle) => ({
    id: handleIdOf(shape, handle.id),
    kind: 'point',
    at: onGround(view.toView(handle.point)),
    surface: { kind: 'ground' },
    target:
      shape.form === 'wall' && (handle.id === 'from' || handle.id === 'to')
        ? { kind: 'line-end', lineId: shapeId(shape), end: handle.id }
        : {
            kind: 'shape-corner',
            shapeId: shapeId(shape),
            index: cornerIndex(shape, handle.point),
          },
  }));
}

function orderLabels(draft: Draft, view: ZoneView): EditOverlay['labels'] {
  return cleanShapes(draft).flatMap((shape, index) => {
    const [corner] = housePoints(shape, view);
    if (corner === undefined) return [];
    return [{ at: onGround(corner), text: `Zone ${String(index + 1)}`, tone: 'accent' as const }];
  });
}

export interface ZoneSceneInput {
  readonly draft: Draft;
  readonly selected: number | null;
  readonly view: ZoneView;
  readonly frameKey: string;
}

export function zoneSceneOverlay({ draft, selected, view, frameKey }: ZoneSceneInput): EditOverlay {
  const chosen = draft.find((shape) => shape.key === selected);
  return {
    mode: 'none',
    selection: [],
    roomDrag: false,
    gizmo: null,
    handles: chosen === undefined ? [] : [...handlesFor(chosen, view)],
    shapes: draft.map((shape) => sceneShape(shape, view)),
    ghosts: draft.flatMap((shape) => ghostOf(shape, view, shape.key === selected)),
    labels: orderLabels(draft, view),
    snapping: false,
    readOnly: false,
    place: null,
    paint: null,
    frame: { key: frameKey, bounds: view.bounds, top: true },
    scanExtent: null,
  };
}

interface Grabbed {
  readonly key: number;
  readonly handle: HandleId;
  readonly start: VacuumPoint;
}

function grabbedOf(draft: Draft, selected: number | null, id: string): Grabbed | null {
  const shape = draft.find((candidate) => candidate.key === selected);
  const handle =
    shape === undefined
      ? undefined
      : handlesOf(shape).find((item) => handleIdOf(shape, item.id) === id);
  return shape === undefined || handle === undefined
    ? null
    : { key: shape.key, handle: handle.id, start: handle.point };
}

export interface ZoneEventInput {
  readonly draft: Draft;
  readonly selected: number | null;
  readonly view: ZoneView;
  readonly bounds: Bounds;
}

export function zoneActionsOf(input: ZoneEventInput, event: EditEvent): readonly ZoneAction[] {
  const { draft, selected, view, bounds } = input;
  if (event.type === 'tap') {
    const point = view.toRobot(event.point);
    const hit = hitShape(draft, selected, point, HIT_RADIUS_PX * event.metresPerPx);
    return [{ type: 'select', key: hit?.key ?? null }];
  }
  if (event.type !== 'vertex') return [];
  const grab = grabbedOf(draft, selected, event.handleId);
  if (grab === null) return [];
  return [
    { type: 'grab', ...grab },
    { type: 'drag', point: view.toRobot(event.point), bounds },
    { type: 'release' },
  ];
}

export interface ZoneNotice {
  readonly text: string;
  readonly tone: 'info';
}

export function zoneNotice(draft: Draft, selected: number | null): ZoneNotice {
  const shape = draft.find((candidate) => candidate.key === selected);
  if (shape === undefined) return { text: 'Tap a zone or a wall to select it', tone: 'info' };
  if (shape.form === 'wall') return { text: 'Drag an end knob to change the wall', tone: 'info' };
  if (shape.form === 'fixed') {
    return { text: 'This area is rotated on the robot. Remove it to draw a new one', tone: 'info' };
  }
  return { text: 'Drag a corner knob to resize. Move it with the arrows below', tone: 'info' };
}
