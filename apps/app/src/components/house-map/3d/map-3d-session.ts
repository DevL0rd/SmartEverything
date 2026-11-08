import type { VacuumPose } from '@smarteverything/domain/vacuum-scene';
import type { RenderSceneSource } from '../render-scene';
import type { VacuumFinish } from '@smarteverything/domain/vacuum-finish';
import {
  DEFAULT_SCENE_OPTIONS,
  buildLiveTrail,
  buildSceneGeometry,
  type MeshLayer,
  type SceneGeometry,
  type SceneInput,
  type SceneTheme,
} from './vacuum-geometry';
import { RENDER_FLOOR } from './render-floor-wire';
import { LIVE_WIRE, type ScanPlacementWire } from './map-3d-protocol';
import { LIVE_TRAIL, type LiveTrailMessage, type ScanFormat } from './map-3d-messages';
import type { RealisticHook } from './render-core-realistic';
import type { LiveHook } from './render-core-live';
import type { CameraPresetId } from './render-core-orbit';
import { SCENE_MODELS, objectModelsOf, type ObjectsHook } from './render-core-objects';
import {
  EDIT_FLOOR,
  EDIT_OVERLAY,
  type EditFloorWire,
  type EditOverlay,
} from './map-3d-edit-protocol';
import type { StageEdit } from './render-core-edit';

export interface SceneRenderer {
  readonly objects: ObjectsHook | null;
  readonly live: LiveHook;
  readonly realistic: RealisticHook;
  setGeometry(geometry: SceneGeometry): void;
  setPose(pose: VacuumPose | null, turretRaised: number): void;
  setLiveTrail(layers: readonly MeshLayer[], baseShown: boolean): void;
  setPreset(preset: CameraPresetId): void;
  setActive(active: boolean): void;
  setEdit(edit: StageEdit | null): void;
  editResult(seq: number, accepted: boolean): void;
  resize(width: number, height: number, ratio: number): void;
  dispose(): void;
}

const NO_LIVE_TRAIL: LiveTrailMessage = { base: true, live: [] };

export class Map3dSession {
  private held: SceneInput | null = null;
  private pose: VacuumPose | null = null;
  private turretRaised = 0;
  private finish: VacuumFinish = DEFAULT_SCENE_OPTIONS.finish;
  private trail: LiveTrailMessage = NO_LIVE_TRAIL;
  private editFloor: {
    readonly key: string;
    readonly wire: EditFloorWire;
    readonly committed: number | null;
  } | null = null;
  private overlay: EditOverlay | null = null;
  private scan: ScanPlacementWire | null = null;

  constructor(
    private readonly renderer: SceneRenderer,
    private theme: SceneTheme = DEFAULT_SCENE_OPTIONS.theme,
  ) {}

  loadScene(key: string, source: RenderSceneSource, floorJson: string): void {
    if (this.held?.key === key) return;
    this.held = { key, source, floor: RENDER_FLOOR.parse(JSON.parse(floorJson)) };
    this.rebuild();
  }

  setTheme(theme: SceneTheme): void {
    if (this.theme === theme) return;
    this.theme = theme;
    this.rebuild();
  }

  setFinish(finish: VacuumFinish): void {
    if (this.finish === finish) return;
    this.finish = finish;
    this.rebuild();
  }

  setPose(x: number, y: number, yaw: number, turretRaised: number): void {
    this.pose = { x, y, yaw };
    this.turretRaised = turretRaised;
    this.renderer.setPose(this.pose, this.turretRaised);
  }

  setTrail(trailJson: string): void {
    this.trail = LIVE_TRAIL.parse(JSON.parse(trailJson));
    this.applyTrail();
  }

  setModels(modelsJson: string): void {
    this.renderer.objects?.setModels(objectModelsOf(SCENE_MODELS.parse(JSON.parse(modelsJson))));
  }

  setLive(liveJson: string): void {
    const wire = LIVE_WIRE.parse(JSON.parse(liveJson));
    this.renderer.live.setLive(wire);
    this.renderer.realistic.setLighting(wire.lighting);
  }

  setScan(key: string, url: string, format: ScanFormat): void {
    this.renderer.realistic.setScan({ key, url, format });
  }

  clearScan(): void {
    this.scan = null;
    this.renderer.realistic.setScan(null);
    this.applyEdit();
  }

  setScanPlacement(placement: ScanPlacementWire): void {
    this.scan = placement;
    this.renderer.realistic.setPlacement(placement);
    this.applyEdit();
  }

  setEditFloor(key: string, floorJson: string, committed: number | null): void {
    if (this.editFloor?.key === key) return;
    this.editFloor = { key, wire: EDIT_FLOOR.parse(JSON.parse(floorJson)), committed };
    this.applyEdit();
  }

  setEdit(overlayJson: string): void {
    this.overlay = EDIT_OVERLAY.parse(JSON.parse(overlayJson));
    this.applyEdit();
  }

  editResult(seq: number, accepted: boolean): void {
    this.renderer.editResult(seq, accepted);
  }

  clearEdit(): void {
    this.overlay = null;
    this.editFloor = null;
    this.applyEdit();
  }

  setScanBand(bottom: number, top: number): void {
    this.renderer.realistic.setBand({ bottom, top });
  }

  clearScanBand(): void {
    this.renderer.realistic.setBand(null);
  }

  clearPose(): void {
    this.pose = null;
    this.renderer.setPose(null, this.turretRaised);
  }

  private rebuild(): void {
    if (this.held === null) return;
    this.renderer.setGeometry(
      buildSceneGeometry(this.held, { theme: this.theme, finish: this.finish }),
    );
    this.renderer.objects?.setFloor(this.held.floor, this.theme);
    this.renderer.live.setFloor(this.held.floor, this.theme);
    this.renderer.realistic.setFloor(this.held.key, this.held.floor);
    this.applyTrail();
    this.renderer.setPose(this.pose, this.turretRaised);
    this.applyEdit();
  }

  private applyEdit(): void {
    const { held, overlay, editFloor, scan } = this;
    if (held === null || overlay === null || editFloor === null) {
      this.renderer.setEdit(null);
      return;
    }
    const placement =
      scan === null
        ? null
        : { tx: scan.tx, ty: scan.ty, tz: scan.tz, yawDeg: scan.yawDeg, scale: scan.scale };
    this.renderer.setEdit({
      overlay,
      floor: held.floor,
      edit: editFloor.wire,
      committed: editFloor.committed,
      scan: placement,
    });
  }

  private applyTrail(): void {
    if (this.held === null) return;
    this.renderer.setLiveTrail(buildLiveTrail(this.trail.live, this.theme), this.trail.base);
  }
}
