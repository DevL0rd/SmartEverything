import type { PerspectiveCamera } from 'three';
import type { EditEvent, EditFloorWire } from './map-3d-edit-protocol';
import { editDrags, type EditDragView, type EditPreview } from './edit/edit-drags';
import type { GizmoBreakpoint } from './edit/gizmo';
import {
  IDLE_DRAG,
  NO_YIELD,
  sameYield,
  type OverlayDrag,
  localPair,
  type OverlayScene,
  type TouchPair,
  type YieldZones,
} from './edit/overlay-model';
import {
  overlaySceneOf,
  posedItemOf,
  previewedView,
  samePreviews,
  settled,
} from './edit/overlay-scene';
import { fullWallsOf } from './edit/overlay-surfaces';
import { gizmoCentres, gizmoLayout } from './edit/gizmo-handles';
import type { DragGrab, EditPointer, HandleCentre, PointerHover, StartDrag } from './edit/pointer';
import { SceneEditing, type EditSource, type SceneEdit } from './edit/pointer-scene';
import type { ScanPlacement } from './edit/sessions-shape-base';
import { markBoxes } from './map-3d-marks';
import {
  anchorRectOf,
  frameSteer,
  groundShift,
  revealShift,
  stageBoxOf,
  type CameraSteer,
} from './render-core-fit';
import type { ScreenMarks } from './render-core-marks';
import type { ObjectPose, ObjectPreview } from './render-core-objects';
import type { CameraView } from './render-core-orbit';

export interface StageEdit extends SceneEdit {
  readonly edit: EditFloorWire;
  readonly committed: number | null;
  readonly scan: ScanPlacement | null;
}

export const PICK_UP_LIFT_M = 0.08;

export interface OverlaySink {
  readonly paint: (scene: OverlayScene | null) => void;
}

export interface EditStageSource extends Omit<EditSource, 'hooks' | 'gizmoCentres' | 'viewport'> {
  readonly viewport: () => CameraView;
  readonly onEdit: ((event: EditEvent) => void) | undefined;
  readonly onYield: (zones: YieldZones) => void;
  readonly breakpoint: () => GizmoBreakpoint;
  readonly requestRender: () => void;
  readonly steer: (steer: CameraSteer) => void;
}

const UNNAMED = 'item';

const NO_WALLS: ReadonlySet<string> = new Set();

const PICK_UP_ENDS: ReadonlySet<EditEvent['type']> = new Set(['tap', 'menu', 'cancel']);

function pickUpOf(event: EditEvent, current: string | null): string | null {
  if (event.type === 'pick-up') return event.id;
  return PICK_UP_ENDS.has(event.type) ? null : current;
}

function revealKeyOf(edit: StageEdit | null): string | null {
  if (edit === null || edit.overlay.selection.length === 0) return null;
  return `${edit.overlay.selection.join(',')}|${edit.overlay.gizmo?.mode ?? ''}`;
}

export class EditStage {
  private target: StageEdit | null = null;
  private editing: SceneEditing | null = null;
  private interactive = false;
  private painter: OverlaySink | null = null;
  private drag: OverlayDrag = IDLE_DRAG;
  private held: EditPreview | null = null;
  private heldSeq: number | null = null;
  private pickUp: string | null = null;
  private lifted: string | null = null;
  private posed: readonly ObjectPreview[] = [];
  private yielded: YieldZones = NO_YIELD;
  private hover: PointerHover | null = null;
  private touches: TouchPair | null = null;
  private full: ReadonlySet<string> = NO_WALLS;
  private framed: string | null = null;
  private revealKey: string | null = null;
  private revealing = false;
  private anchored: string | null = null;
  private anchorSeq = 0;

  constructor(private readonly source: EditStageSource) {}

  get pointer(): EditPointer | null {
    return this.editing?.pointer ?? null;
  }

  get fullWalls(): ReadonlySet<string> {
    return this.full;
  }

  set(edit: StageEdit | null): void {
    if (edit === null && this.target === null) return;
    if (edit === null || (edit.committed !== null && edit.committed === this.heldSeq)) {
      this.drop();
    }
    if (edit === null) this.reset();
    this.target = edit;
    this.full = edit === null ? NO_WALLS : fullWallsOf(edit.edit, edit.overlay.selection);
    this.watchSelection(edit);
    this.frameFor(edit);
    this.syncPointer();
    this.syncObjects();
    this.source.requestRender();
  }

  setInteractive(interactive: boolean): void {
    if (this.interactive === interactive) return;
    this.interactive = interactive;
    this.anchored = null;
    this.syncPointer();
  }

  result(seq: number, accepted: boolean): void {
    if (accepted || seq !== this.heldSeq) return;
    this.drop();
    this.syncObjects();
    this.source.requestRender();
  }

  setPainter(painter: OverlaySink | null): void {
    this.painter?.paint(null);
    this.painter = painter;
    this.source.requestRender();
  }

  paint(camera: PerspectiveCamera, marks: ScreenMarks): void {
    const view = this.target === null ? null : this.viewOf(this.target, camera);
    const scene = view === null ? null : this.sceneOf(view, marks);
    this.painter?.paint(scene);
    if (view !== null && scene !== null && !this.reveal(view, scene)) this.anchor(view);
    const zones = scene?.yieldTo ?? NO_YIELD;
    if (sameYield(zones, this.yielded)) return;
    this.yielded = zones;
    this.source.onYield(zones);
  }

  dispose(): void {
    this.editing = SceneEditing.next(this.editing, null, () => this.editSource());
    this.painter?.paint(null);
  }

  private reset(): void {
    this.drag = IDLE_DRAG;
    this.pickUp = null;
    this.lifted = null;
    this.hover = null;
    this.touches = null;
    this.anchored = null;
  }

  private watchSelection(edit: StageEdit | null): void {
    const key = revealKeyOf(edit);
    if (key === this.revealKey) return;
    this.revealKey = key;
    this.revealing = key !== null;
    this.anchored = null;
  }

  private frameFor(edit: StageEdit | null): void {
    const steer = edit === null ? null : frameSteer(edit.overlay.frame, edit.edit.floor.elevation);
    const key = edit?.overlay.frame?.key ?? null;
    if (key === this.framed) return;
    this.framed = key;
    if (steer !== null) this.source.steer(steer);
  }

  private reveal(view: EditDragView, scene: OverlayScene): boolean {
    if (!this.revealing || this.drag.grab !== null) return false;
    this.revealing = false;
    const { discs } = scene.yieldTo;
    const shift = revealShift(discs, stageBoxOf(this.source.viewport()));
    const first = discs[0];
    if (first === undefined) return false;
    const elevation = view.edit.floor.elevation;
    const by = groundShift({ camera: view.camera, bounds: view.bounds, elevation }, first, shift);
    if (by === null) return false;
    this.source.steer({ kind: 'shift', by });
    return true;
  }

  private anchor(view: EditDragView): void {
    const { onEdit } = this.source;
    if (onEdit === undefined || this.editing === null || this.drag.grab !== null) return;
    const rect = anchorRectOf(previewedView(view, this.held));
    const key = JSON.stringify(rect);
    if (key === this.anchored) return;
    this.anchored = key;
    const seq = this.anchorSeq;
    this.anchorSeq += 1;
    onEdit({ type: 'anchor', seq, rect });
  }

  private drop(): void {
    this.held = null;
    this.heldSeq = null;
  }

  private objectPreviews(): readonly ObjectPreview[] {
    const live = this.drag.grab === null ? null : posedItemOf(this.drag.preview);
    const hold = posedItemOf(this.held);
    const posed = new Map<string, ObjectPose | null>();
    if (hold !== null) posed.set(hold.id, hold.pose);
    if (live !== null) posed.set(live.id, live.pose);
    if (this.lifted !== null && !posed.has(this.lifted)) posed.set(this.lifted, null);
    return [...posed].map(([id, pose]) => ({
      id,
      pose,
      lift: id === this.lifted ? PICK_UP_LIFT_M : 0,
    }));
  }

  private syncObjects(): void {
    const next = this.objectPreviews();
    if (samePreviews(next, this.posed)) return;
    this.posed = next;
    this.source.items()?.preview(next);
  }

  private sceneOf(view: EditDragView, marks: ScreenMarks): OverlayScene {
    const drag = this.drag.grab === null ? { grab: null, preview: this.held } : this.drag;
    return overlaySceneOf({
      view,
      drag,
      pickUp: this.pickUp,
      hover: this.hover,
      touches: this.touches === null ? null : localPair(this.touches, view.bounds),
      avoid: markBoxes(marks, drag.grab === null),
    });
  }

  private syncPointer(): void {
    const live = this.interactive && this.target !== null ? this.target : null;
    this.editing = SceneEditing.next(this.editing, live, () => this.editSource());
  }

  private viewOf(target: StageEdit, camera: PerspectiveCamera): EditDragView {
    const { overlay, edit, scan } = target;
    return {
      camera,
      bounds: this.source.bounds(),
      viewport: this.source.viewport(),
      edit,
      snapping: overlay.snapping,
      nameOf: (id) => edit.floor.objects.find((object) => object.id === id)?.label ?? UNNAMED,
      overlay,
      breakpoint: this.source.breakpoint(),
      scan,
    };
  }

  private dragView(): EditDragView {
    const { target } = this;
    if (target === null) throw new EditTargetGoneError();
    return this.viewOf(target, this.source.camera());
  }

  private editSource(): EditSource {
    const { onEdit } = this.source;
    const hooks =
      onEdit === undefined
        ? undefined
        : {
            onEdit: (event: EditEvent): void => {
              this.pickUp = pickUpOf(event, this.pickUp);
              this.lifted = pickUpOf(event, this.lifted);
              if (this.held !== null && this.heldSeq === null) this.heldSeq = event.seq;
              this.syncObjects();
              this.source.requestRender();
              onEdit(event);
            },
            onHover: (hover: PointerHover | null): void => {
              this.hover = hover;
              this.source.requestRender();
            },
            startDrag: this.touching(
              editDrags({
                view: () => this.dragView(),
                preview: (preview) => {
                  this.onPreview(preview);
                },
                active: (grab) => {
                  this.onActive(grab);
                },
              }),
            ),
          };
    return { ...this.source, hooks, gizmoCentres: () => this.centres() };
  }

  private centres(): readonly HandleCentre[] {
    const { target } = this;
    if (target === null) return [];
    const view = this.viewOf(target, this.source.camera());
    return gizmoCentres(gizmoLayout(previewedView(view, this.held)));
  }

  private touching(start: StartDrag): StartDrag {
    return (begin) => {
      const session = start(begin);
      return {
        move: (at, modifiers): void => {
          session.move(at, modifiers);
        },
        twist: (motion, modifiers, touches): void => {
          this.touches = touches;
          session.twist(motion, modifiers, touches);
          this.source.requestRender();
        },
        end: () => session.end(),
        cancel: (): void => {
          session.cancel();
        },
      };
    };
  }

  private onPreview(preview: EditPreview | null): void {
    this.drag = { ...this.drag, preview };
    if (preview === null) this.drop();
    this.syncObjects();
    this.source.requestRender();
  }

  private onActive(grab: DragGrab | null): void {
    if (grab === null) {
      this.held = settled(this.drag.preview);
      this.heldSeq = null;
      this.touches = null;
    }
    this.drag = grab === null ? IDLE_DRAG : { grab, preview: null };
    this.pickUp = null;
    if (grab === null) this.lifted = null;
    this.syncObjects();
    this.source.requestRender();
  }
}

export class EditTargetGoneError extends Error {
  constructor() {
    super('A 3D map drag asked for its view after editing stopped');
    this.name = 'EditTargetGoneError';
  }
}
