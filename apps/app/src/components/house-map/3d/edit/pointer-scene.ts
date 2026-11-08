import type { PerspectiveCamera } from 'three';
import type { RenderFloor } from '../../render-scene';
import type {
  EditEvent,
  EditFloorWire,
  EditOverlay,
  EditPaintTarget,
} from '../map-3d-edit-protocol';
import type { Point } from '../render-core-gestures';
import type { ObjectsLayer } from '../render-core-objects';
import { pointerToNdc, type PickTargets, type Viewport } from '../render-core-orbit';
import {
  openingSegmentsOf,
  pressPick,
  wallSegmentsOf,
  type PickInput,
  type PressPick,
  type WallPickLook,
} from '../render-core-pick';
import type { SceneObjectModel } from '../scene-objects';
import { metresPerPxAt, planeAt, screenNdc, screenRay } from './ground';
import {
  EditPointer,
  type GroundTap,
  type HandleCentre,
  type PlaceSpot,
  type PointerHover,
  type PointerScene,
  type PressTimer,
  type StartDrag,
} from './pointer';
import { placeSpotAt, sideToward } from './pointer-place';

export interface ScreenBounds {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface EditHooks {
  readonly onEdit: (event: EditEvent) => void;
  readonly onHover: (hover: PointerHover | null) => void;
  readonly startDrag: StartDrag;
}

export interface SceneEdit {
  readonly overlay: EditOverlay;
  readonly floor: RenderFloor;
  readonly edit: EditFloorWire;
}

export interface EditSource {
  readonly hooks: EditHooks | undefined;
  readonly camera: () => PerspectiveCamera;
  readonly bounds: () => ScreenBounds;
  readonly viewport: () => Viewport;
  readonly targets: () => PickTargets;
  readonly look: () => WallPickLook | null;
  readonly items: () => ObjectsLayer<SceneObjectModel> | null;
  readonly gizmoCentres: () => readonly HandleCentre[];
}

export interface PointerView {
  readonly camera: PerspectiveCamera;
  readonly bounds: ScreenBounds;
  readonly input: PickInput;
  readonly floorId: string;
  readonly overlay: EditOverlay;
  readonly edit: EditFloorWire;
  readonly gizmo: readonly HandleCentre[];
}

export class EditingUnavailableError extends Error {
  constructor() {
    super('Editing was turned on for a 3D map created without edit hooks');
    this.name = 'EditingUnavailableError';
  }
}

const pressTimer: PressTimer = (ms, fire) => {
  const id = setTimeout(fire, ms);
  return (): void => {
    clearTimeout(id);
  };
};

function centresOf(view: PointerView): readonly HandleCentre[] {
  const { camera, bounds, input, overlay } = view;
  const own = overlay.handles.flatMap((handle) => {
    const ndc = screenNdc(camera, [handle.at.x, input.elevation + handle.at.height, -handle.at.y]);
    if (ndc === null) return [];
    return [
      {
        id: handle.id,
        x: bounds.left + ((ndc.x + 1) / 2) * bounds.width,
        y: bounds.top + ((1 - ndc.y) / 2) * bounds.height,
      },
    ];
  });
  return [...own, ...view.gizmo];
}

function groundOf(view: PointerView, at: Point): GroundTap | null {
  const { camera, bounds, input } = view;
  const hit = planeAt(screenRay(camera, pointerToNdc(at, bounds)), input.elevation);
  if (hit === null) return null;
  const metresPerPx = metresPerPxAt(camera, hit.world, input.viewport);
  if (metresPerPx === null) return null;
  return { point: { x: hit.world[0], y: -hit.world[2] }, floorId: view.floorId, metresPerPx };
}

function paintOf(view: PointerView, at: Point): EditPaintTarget | null {
  const { camera, bounds, input, overlay } = view;
  if (overlay.paint === null) return null;
  const walls = overlay.paint.surface === 'wall' ? input.walls : [];
  const only: PickInput = { ...input, devices: [], objects: [], openings: [], walls };
  const { pick } = pressPick(camera, pointerToNdc(at, bounds), only, null);
  if (pick.kind === 'room' && overlay.paint.surface === 'floor') {
    return { kind: 'floor', roomId: pick.id };
  }
  const wall = pick.kind === 'wall' ? walls.find((each) => each.id === pick.id) : undefined;
  return wall === undefined
    ? null
    : { kind: 'wall', wallId: wall.id, side: sideToward(wall, camera) };
}

export function pointerSceneOf(view: () => PointerView): PointerScene {
  return {
    pressAt: (at, bodyId): PressPick => {
      const { camera, bounds, input } = view();
      return pressPick(camera, pointerToNdc(at, bounds), input, bodyId);
    },
    handleCentres: () => centresOf(view()),
    groundAt: (at) => groundOf(view(), at),
    stagePoint: (at): Point => {
      const { bounds } = view();
      return { x: at.x - bounds.left, y: at.y - bounds.top };
    },
    isRoom: (id) => view().input.targets.ranges.some((range) => range.roomId === id),
    paintAt: (at) => paintOf(view(), at),
    placeAt: (at): PlaceSpot | null => {
      const current = view();
      const { place } = current.overlay;
      return place === null
        ? null
        : placeSpotAt({ ...current, viewport: current.input.viewport }, place, at);
    },
  };
}

export function editInputOf(source: EditSource, floor: RenderFloor): PickInput {
  const { elevation } = floor;
  const look = source.look();
  const walls = look === null ? [] : wallSegmentsOf(floor.walls, look, elevation);
  const items = source.items();
  return {
    targets: source.targets(),
    viewport: source.viewport(),
    elevation,
    devices: items?.deviceBoxes() ?? [],
    objects: items?.objectBoxes() ?? [],
    walls,
    openings: openingSegmentsOf(floor.openings, walls, elevation),
  };
}

export class SceneEditing {
  readonly pointer: EditPointer;
  private target: SceneEdit;

  constructor(edit: SceneEdit, source: EditSource) {
    const { hooks } = source;
    if (hooks === undefined) throw new EditingUnavailableError();
    this.target = edit;
    this.pointer = new EditPointer(edit.overlay, {
      scene: pointerSceneOf(() => ({
        camera: source.camera(),
        bounds: source.bounds(),
        input: editInputOf(source, this.target.floor),
        floorId: this.target.floor.id,
        overlay: this.target.overlay,
        edit: this.target.edit,
        gizmo: source.gizmoCentres(),
      })),
      emit: hooks.onEdit,
      hover: hooks.onHover,
      startDrag: hooks.startDrag,
      timer: pressTimer,
    });
  }

  private update(edit: SceneEdit): void {
    this.target = edit;
    this.pointer.setOverlay(edit.overlay);
  }

  static next(
    current: SceneEditing | null,
    edit: SceneEdit | null,
    source: () => EditSource,
  ): SceneEditing | null {
    if (edit === null) {
      current?.pointer.dispose();
      return null;
    }
    if (current === null) return new SceneEditing(edit, source());
    current.update(edit);
    return current;
  }
}
