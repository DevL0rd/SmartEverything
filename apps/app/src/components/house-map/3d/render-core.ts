import { Scene, type PerspectiveCamera, type WebGLRenderer } from 'three';
import type { VacuumPose } from '@smarteverything/domain';
import type { QualitySettings } from '../live-visibility/quality-scaler';
import type { EditEvent } from './map-3d-edit-protocol';
import { gizmoBreakpointOf, type YieldZones } from './edit/overlay-model';
import { EditStage, type OverlaySink, type StageEdit } from './render-core-edit';
import {
  applyPixelRatio,
  canvasPixelRatio,
  createRenderer,
  releaseRenderer,
} from './render-core-renderer';
import type { RealisticView } from './render-core-realistic';
import { realisticViewOf, sceneLights } from './render-core-parts';
import {
  robotPlacement,
  turretElevation,
  type MeshLayer,
  type SceneGeometry,
} from './vacuum-geometry';
import { LayerSlot } from './render-core-layers';
import { FrameLoop } from './render-core-frame';
import { RoomHighlight } from './render-core-selection';
import { LiveLayer } from './render-core-live';
import { screenMarks, type ScreenMarks } from './render-core-marks';
import type { GlowDecals } from './light-pools';
import { WallCutaway } from './render-core-cutaway';
import { objectsLayerOf, type ObjectsLayer } from './render-core-objects';
import type { SceneObjectModel, SceneObjectModelSet, SceneObjectModelSetup } from './scene-objects';
import { GestureTracker, bindCanvas } from './render-core-gestures';
import { viewerInput, pickScene, type ScenePick } from './render-core-pick';
import { CameraRig } from './render-core-camera';
import { FingerTracker, LoupeLens, loupeOf, type LoupeSink } from './render-core-loupe';
import {
  frameRoom,
  type CameraPresetId,
  type PickTargets,
  type ViewInsets,
} from './render-core-orbit';

export * from './render-core-orbit';

export interface RenderCoreOptions {
  readonly canvas: HTMLCanvasElement;
  readonly onPickRoom: (roomId: string | null) => void;
  readonly onPickDevice?: ((deviceId: string) => void) | undefined;
  readonly onMenu?: ((pick: ScenePick) => void) | undefined;
  readonly onMarks?: (marks: ScreenMarks) => void;
  readonly preset?: CameraPresetId;
  readonly createModelSet?: (setup: SceneObjectModelSetup) => SceneObjectModelSet<SceneObjectModel>;
  readonly createDecals?: GlowDecals;
  readonly onFrameTime?: (frameMs: number) => void;
  readonly onScanFailed?: (detail: string) => void;
  readonly onEdit?: ((event: EditEvent) => void) | undefined;
  readonly onYield?: (zones: YieldZones) => void;
}

export type RenderPainter = OverlaySink & LoupeSink;

export class RenderCore {
  private readonly renderer: WebGLRenderer;
  private ratio = 1;
  private renderScale = 1;
  private readonly scene = new Scene();
  private readonly base = new LayerSlot();
  private readonly trail = new LayerSlot();
  private readonly liveTrail = new LayerSlot();
  private readonly robot = new LayerSlot();
  private readonly highlight = new RoomHighlight();
  readonly objects: ObjectsLayer<SceneObjectModel> | null;
  readonly live: LiveLayer;
  readonly realistic: RealisticView;
  private readonly gestures: GestureTracker;
  private readonly unbind: () => void;
  private readonly edit: EditStage;
  private readonly fingers: FingerTracker;
  private readonly lens: LoupeLens;
  private painter: RenderPainter | null = null;
  private grabbing = false;
  private loupeShown = false;
  private geometry: SceneGeometry | null = null;
  private framed: readonly string[] = [];
  private cutaway: WallCutaway | null = null;
  private readonly rig: CameraRig;
  private reducedMotion = false;
  private readonly frames = new FrameLoop((nowMs) => this.onFrame(nowMs));
  private disposed = false;

  constructor(private readonly options: RenderCoreOptions) {
    this.renderer = createRenderer(options.canvas);
    this.rig = new CameraRig(options.preset ?? 'angled', options.canvas, (): void => {
      this.requestRender();
    });
    this.robot.group.visible = false;
    this.objects = objectsLayerOf(options.createModelSet, (): void => {
      this.live.refresh();
      this.requestRender();
    });
    const lights = sceneLights();
    this.live = new LiveLayer({
      lights,
      createDecals: options.createDecals ?? null,
      items: this.objects,
      onChange: (): void => {
        this.requestRender();
      },
    });
    this.realistic = realisticViewOf({
      renderer: this.renderer,
      structure: this.base.group,
      onChange: (): void => {
        this.requestRender();
      },
      onFailed: (detail): void => {
        this.options.onScanFailed?.(detail);
      },
    });
    this.edit = this.editStage();
    this.lens = new LoupeLens(options.canvas, this.renderer);
    this.fingers = new FingerTracker(options.canvas, (): void => {
      if (this.loupeShown) this.requestRender();
    });
    if (this.objects !== null) this.scene.add(this.objects.group);
    this.scene.add(
      this.base.group,
      this.trail.group,
      this.liveTrail.group,
      this.robot.group,
      this.live.group,
      ...lights,
    );
    this.gestures = this.gestureTracker();
    this.unbind = this.bindInput();
  }

  setGeometry(geometry: SceneGeometry): void {
    this.geometry = geometry;
    this.base.replace(geometry.base);
    this.highlight.attach(this.base.named('floor') ?? null, geometry.rooms);
    this.trail.replace(geometry.trail);
    this.robot.replace(geometry.robot);
    this.cutaway = WallCutaway.of(geometry, this.base.named('walls') ?? null);
    this.live.walls(this.cutaway.view());
    this.fitScene(geometry);
  }

  frameRooms(roomIds: readonly string[]): void {
    if (JSON.stringify(roomIds) === JSON.stringify(this.framed)) return;
    this.framed = roomIds;
    if (this.geometry !== null) this.fitScene(this.geometry, true);
  }

  setLiveTrail(layers: readonly MeshLayer[], baseShown: boolean): void {
    this.liveTrail.replace(layers);
    this.trail.group.visible = baseShown;
    this.requestRender();
  }

  setPose(pose: VacuumPose | null, turretRaised: number): void {
    const wasVisible = this.robot.group.visible;
    this.robot.group.visible = pose !== null;
    if (pose !== null) {
      const placement = robotPlacement(pose);
      this.robot.group.position.set(...placement.position);
      this.robot.group.rotation.y = placement.rotationY;
      this.robot.named('robot-turret')?.position.setY(turretElevation(turretRaised));
      this.rig.trackRobot(placement.position, wasVisible);
    }
    this.requestRender();
  }

  setFollow(follow: boolean): void {
    const { x, z } = this.robot.group.position;
    this.rig.setFollow(follow, this.robot.group.visible ? [x, 0, z] : null);
  }

  selectRooms(roomIds: readonly string[]): void {
    if (this.highlight.select(roomIds)) this.requestRender();
  }

  setEdit(edit: StageEdit | null): void {
    this.edit.set(edit);
    this.gestures.setClaim(this.edit.pointer);
  }

  setEditing(editing: boolean): void {
    this.edit.setInteractive(editing);
    this.gestures.setClaim(this.edit.pointer);
  }

  editResult(seq: number, accepted: boolean): void {
    this.edit.result(seq, accepted);
  }

  setOverlayPainter(painter: RenderPainter | null): void {
    this.painter?.paint(null);
    this.painter?.loupe(null);
    this.painter = painter;
    this.requestRender();
  }

  setPreset(preset: CameraPresetId): void {
    this.rig.setPreset(preset);
  }

  resize(width: number, height: number, ratio: number): void {
    this.ratio = ratio;
    this.renderer.setPixelRatio(canvasPixelRatio(ratio, this.renderScale));
    this.renderer.setSize(Math.max(width, 1), Math.max(height, 1), false);
    this.rig.resize(width, height);
  }

  setInsets(insets: ViewInsets): void {
    this.rig.setInsets(insets);
  }

  setQuality(quality: QualitySettings): void {
    this.renderScale = quality.renderScale;
    if (applyPixelRatio(this.renderer, this.ratio, quality.renderScale)) {
      this.requestRender();
    }
    this.objects?.setLodBias(quality.lodBias);
    this.frames.setDivisor(quality.animationDivisor);
    this.live.setDecalShare(quality.decalLightShare);
    this.realistic.setQuality(quality);
  }

  setReducedMotion(reduced: boolean): void {
    this.reducedMotion = reduced;
    this.live.motion(this.frames.running && !reduced);
  }

  setActive(active: boolean): void {
    this.frames.setActive(active && !this.disposed);
    this.live.motion(this.frames.running && !this.reducedMotion);
    this.realistic.setActive(this.frames.running);
  }

  dispose(): void {
    this.disposed = true;
    this.frames.setActive(false);
    this.unbind();
    this.edit.dispose();
    this.painter?.loupe(null);
    this.lens.dispose();
    [this.base, this.trail, this.liveTrail, this.robot].forEach((slot) => {
      slot.release();
    });
    this.objects?.dispose();
    this.live.dispose();
    this.realistic.dispose();
    releaseRenderer(this.renderer);
  }

  private fitScene(geometry: SceneGeometry, resetView = false): void {
    const framing = frameRoom(this.pickTargets(), this.framed, geometry);
    this.rig.setScene(framing.frame, framing.extent, resetView);
    this.requestRender();
  }

  private gestureTracker(): GestureTracker {
    return new GestureTracker({
      orbit: (dx, dy): void => {
        this.rig.drag(dx, dy);
      },
      panZoom: (change): void => {
        this.rig.panZoom(change);
      },
      tap: (x: number, y: number): void => {
        this.tap(x, y);
      },
      menu: (x: number, y: number): void => {
        this.options.onMenu?.(this.pickAt(x, y, true));
      },
    });
  }

  private bindInput(): () => void {
    const unbindGestures = bindCanvas(
      this.options.canvas,
      this.gestures,
      (deltaY, at, alt): void => {
        if (this.edit.pointer?.wheel(deltaY, at, alt) !== 'claimed') this.rig.wheel(deltaY, at);
      },
    );
    const unbindFingers = this.fingers.bind();
    return (): void => {
      unbindGestures();
      unbindFingers();
    };
  }

  private editStage(): EditStage {
    const stage = this.editStageOf();
    stage.setPainter({
      paint: (scene): void => {
        this.grabbing = scene?.cursor === 'grabbing';
        this.painter?.paint(scene);
      },
    });
    return stage;
  }

  private editStageOf(): EditStage {
    return new EditStage({
      onEdit: this.options.onEdit,
      onYield: (zones): void => {
        this.options.onYield?.(zones);
      },
      breakpoint: () => gizmoBreakpointOf(window.innerWidth),
      requestRender: (): void => {
        this.requestRender();
      },
      steer: (steer): void => {
        this.rig.steer(steer);
      },
      camera: () => this.rig.camera(),
      bounds: () => this.options.canvas.getBoundingClientRect(),
      viewport: () => this.rig.viewport,
      targets: () => this.pickTargets(),
      look: () =>
        this.cutaway === null || this.geometry === null
          ? null
          : { view: this.cutaway.view(), cutHeight: this.geometry.cutHeight },
      items: () => this.objects,
    });
  }

  private pickAt(x: number, y: number, withDevices: boolean): ScenePick {
    const devices = withDevices ? (this.objects?.deviceBoxes() ?? []) : [];
    const input = viewerInput(this.pickTargets(), this.rig.viewport, devices);
    return pickScene(this.rig.camera(), this.rig.ndc({ x, y }), input);
  }

  private tap(x: number, y: number): void {
    const pick = this.pickAt(x, y, this.options.onPickDevice !== undefined);
    if (pick.kind === 'device') this.options.onPickDevice?.(pick.id);
    else this.options.onPickRoom(pick.kind === 'room' ? pick.id : null);
  }

  private pickTargets(): PickTargets {
    const layers = this.geometry?.base ?? [];
    return {
      floor: layers.find((layer) => layer.id === 'floor') ?? null,
      walls: this.cutaway?.pickLayer() ?? null,
      ranges: this.geometry?.rooms ?? [],
    };
  }

  private requestRender(): void {
    this.frames.invalidate();
  }

  private onFrame(nowMs: number): boolean {
    const full = this.edit.fullWalls;
    if (this.cutaway?.update(this.rig.state, full) === true) this.live.walls(this.cutaway.view());
    const camera = this.rig.camera();
    const animating = this.live.tick(nowMs, camera);
    this.draw(camera);
    const marks = this.marks(camera);
    this.edit.paint(camera, marks);
    this.drawLoupe(camera);
    this.options.onMarks?.(marks);
    return animating;
  }

  private draw(camera: PerspectiveCamera): void {
    const started = performance.now();
    const under = this.realistic.render(this.renderer, camera, this.rig.viewport);
    this.renderer.autoClear = !under;
    this.renderer.render(this.scene, camera);
    this.renderer.autoClear = true;
    this.options.onFrameTime?.(performance.now() - started);
  }

  private drawLoupe(camera: PerspectiveCamera): void {
    const view = this.rig.viewport;
    const breakpoint = gizmoBreakpointOf(window.innerWidth);
    const at = loupeOf({ grabbing: this.grabbing, breakpoint, finger: this.fingers.finger, view });
    this.loupeShown = at !== null;
    this.painter?.loupe(at);
    if (at === null) {
      this.lens.rest();
      return;
    }
    this.lens.render({ camera, at, view }, (lens): void => {
      if (this.realistic.drawn()) this.renderer.render(this.realistic.scene, lens);
      this.renderer.render(this.scene, lens);
    });
  }

  private marks(camera: PerspectiveCamera): ScreenMarks {
    return screenMarks(camera, this.rig.viewport, {
      labels: this.geometry?.labels ?? [],
      chips: this.live.chips(),
      robot: this.robot.group.visible ? this.robot.group.position : null,
    });
  }
}
