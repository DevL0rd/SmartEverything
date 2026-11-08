import type { VacuumPose } from '@smarteverything/domain/vacuum-scene';
import type { RenderFloor, RenderScene, RenderSceneSource } from '../render-scene';
import type { FloorLighting } from '../lighting';
import type { OverlayModel } from '../overlays/model-types';
import {
  ScanSender,
  liveOverlayOf,
  scanBandOf,
  type Map3dHandle,
  type ScanPlacementWire,
  type ScanSource,
  type ShownTrail,
} from './map-3d-protocol';
import { type EditFloorWire, type EditOverlay, type Map3dEditHandle } from './map-3d-edit-protocol';
import type { SceneModelsWire } from './render-core-objects';

interface Wanted {
  readonly key: string;
  readonly source: RenderSceneSource;
  readonly floor: RenderFloor;
}

export const floorSceneKey = (scene: RenderScene, floor: RenderFloor): string =>
  `${scene.key}:${floor.id}`;

interface PoseMessage {
  readonly pose: VacuumPose | null;
  readonly turretRaised: number;
}

const NO_POSE: PoseMessage = { pose: null, turretRaised: 0 };

function samePose(left: PoseMessage, right: PoseMessage): boolean {
  if (left.turretRaised !== right.turretRaised) return false;
  if (left.pose === null || right.pose === null) return left.pose === right.pose;
  return (
    left.pose.x === right.pose.x && left.pose.y === right.pose.y && left.pose.yaw === right.pose.yaw
  );
}

export interface BridgeLive {
  readonly overlay: OverlayModel;
  readonly lighting: FloorLighting;
}

export class HandleSlot {
  current: Map3dHandle | null = null;
}

export class EditSender {
  private connected = false;
  private floor: {
    readonly key: string;
    readonly json: string;
    readonly committed: number | null;
  } | null = null;
  private overlay: string | null = null;
  private sentFloorKey: string | null = null;
  private sentOverlay: string | null = null;

  constructor(private readonly target: () => Map3dEditHandle | null) {}

  ready(): void {
    this.connected = true;
    this.sentFloorKey = null;
    this.sentOverlay = null;
    this.flush();
  }

  lost(): void {
    this.connected = false;
  }

  showFloor(key: string, floor: EditFloorWire, committed: number | null): void {
    if (this.floor?.key === key) return;
    this.floor = { key, json: JSON.stringify(floor), committed };
    this.flush();
  }

  show(overlay: EditOverlay | null): void {
    this.overlay = overlay === null ? null : JSON.stringify(overlay);
    this.flush();
  }

  result(seq: number, accepted: boolean): void {
    const handle = this.connected ? this.target() : null;
    handle?.editResult(seq, accepted);
  }

  private flush(): void {
    const handle = this.connected ? this.target() : null;
    if (handle === null) return;
    if (this.overlay === null) {
      if (this.sentOverlay !== null || this.sentFloorKey !== null) handle.clearEdit();
      this.sentOverlay = null;
      this.sentFloorKey = null;
      return;
    }
    if (this.floor === null) return;
    if (this.floor.key !== this.sentFloorKey) {
      handle.setEditFloor(this.floor.key, this.floor.json, this.floor.committed);
      this.sentFloorKey = this.floor.key;
    }
    if (this.overlay !== this.sentOverlay) {
      handle.setEdit(this.overlay);
      this.sentOverlay = this.overlay;
    }
  }
}

export class Map3dBridge {
  private connected = false;
  private wanted: Wanted | null = null;
  private pose: PoseMessage = NO_POSE;
  private sentKey: string | null = null;
  private sentPose: PoseMessage = NO_POSE;
  private trail: ShownTrail | null = null;
  private sentTrail: ShownTrail | null = null;
  private models: SceneModelsWire | null = null;
  private sentModels: SceneModelsWire | null = null;
  private live: BridgeLive | null = null;
  private sentLive: BridgeLive | null = null;
  private readonly scan: ScanSender;
  private readonly edit: EditSender;

  constructor(private readonly target: () => Map3dHandle | null) {
    this.scan = new ScanSender(target);
    this.edit = new EditSender(target);
  }

  ready(): void {
    this.connected = true;
    this.scan.ready();
    this.edit.ready();
    this.sentKey = null;
    this.sentPose = NO_POSE;
    this.sentTrail = null;
    this.sentModels = null;
    this.sentLive = null;
    this.flush();
  }

  lost(): void {
    this.connected = false;
    this.scan.lost();
    this.edit.lost();
  }

  setEditFloor(key: string, floor: EditFloorWire, committed: number | null): void {
    this.edit.showFloor(key, floor, committed);
  }

  setEdit(overlay: EditOverlay | null): void {
    this.edit.show(overlay);
  }

  editResult(seq: number, accepted: boolean): void {
    this.edit.result(seq, accepted);
  }

  setScan(source: ScanSource | null, placement: ScanPlacementWire | null): void {
    this.scan.show(source, placement);
  }

  retryScan(): void {
    this.scan.retry();
  }

  setScene(scene: RenderScene, floor: RenderFloor): void {
    const key = floorSceneKey(scene, floor);
    if (this.wanted?.key === key) return;
    this.wanted = { key, source: scene.source, floor };
    this.flush();
    this.scan.setBand(scanBandOf(floor));
  }

  setPose(pose: VacuumPose | null, turretRaised: number): void {
    this.pose = { pose, turretRaised };
    this.flush();
  }

  setModels(models: SceneModelsWire): void {
    this.models = models;
    this.flush();
  }

  setLive(live: BridgeLive): void {
    this.live = live;
    this.flush();
  }

  setTrail(trail: ShownTrail): void {
    this.trail = trail;
    this.flush();
  }

  private flush(): void {
    const handle = this.connected ? this.target() : null;
    if (handle === null) return;
    this.flushModels(handle);
    this.flushScene(handle);
    this.flushTrail(handle);
    this.flushLive(handle);
    this.flushPose(handle);
  }

  private flushLive(handle: Map3dHandle): void {
    if (this.sentKey === null || this.live === null || this.live === this.sentLive) return;
    const { overlay, lighting } = this.live;
    handle.setLive(JSON.stringify({ overlay: liveOverlayOf(overlay), lighting }));
    this.sentLive = this.live;
  }

  private flushScene(handle: Map3dHandle): void {
    if (this.wanted === null || this.wanted.key === this.sentKey) return;
    const { key, source, floor } = this.wanted;
    handle.setScene(key, source, JSON.stringify(floor));
    this.sentKey = this.wanted.key;
    this.sentTrail = null;
  }

  private flushModels(handle: Map3dHandle): void {
    if (this.models === null || this.models === this.sentModels) return;
    handle.setModels(JSON.stringify(this.models));
    this.sentModels = this.models;
  }

  private flushTrail(handle: Map3dHandle): void {
    if (this.sentKey === null || this.trail === null || this.trail === this.sentTrail) return;
    const { base, live } = this.trail;
    handle.setTrail(JSON.stringify({ base: base.length > 0, live }));
    this.sentTrail = this.trail;
  }

  private flushPose(handle: Map3dHandle): void {
    if (this.sentKey === null || samePose(this.sentPose, this.pose)) return;
    const { pose, turretRaised } = this.pose;
    if (pose === null) {
      handle.clearPose();
    } else {
      handle.setPose(pose.x, pose.y, pose.yaw, turretRaised);
    }
    this.sentPose = this.pose;
  }
}
