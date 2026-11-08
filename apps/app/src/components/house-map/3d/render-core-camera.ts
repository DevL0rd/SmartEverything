import type { PerspectiveCamera } from 'three';
import type { Vec3 } from './mesh';
import { fitToCorners, steerOrbit, type CameraSteer } from './render-core-fit';
import type { PanZoom, Point } from './render-core-gestures';
import {
  NO_INSETS,
  WHEEL_ZOOM_PER_UNIT,
  buildCamera,
  followDistance,
  followOrbit,
  orbitDrag,
  orbitPan,
  orbitZoomAt,
  pointerToNdc,
  presetOrbit,
  type CameraPresetId,
  type CameraView,
  type Ndc,
  type OrbitState,
  type ViewInsets,
} from './render-core-orbit';
import type { SceneFrame } from './vacuum-geometry';

export class CameraRig {
  private frame: SceneFrame = { centre: [0, 0, 0], radius: 1 };
  private extent: readonly Vec3[] = [];
  private view: CameraView = { width: 1, height: 1, insets: NO_INSETS };
  private orbit: OrbitState;
  private moved = false;
  private following = false;

  constructor(
    private preset: CameraPresetId,
    private readonly canvas: Pick<HTMLCanvasElement, 'getBoundingClientRect'>,
    private readonly changed: () => void,
  ) {
    this.orbit = presetOrbit(preset, this.frame, 1);
  }

  get viewport(): CameraView {
    return this.view;
  }

  get state(): OrbitState {
    return this.orbit;
  }

  camera(): PerspectiveCamera {
    return buildCamera(this.orbit, this.view, this.frame);
  }

  ndc(at: Point): Ndc {
    return pointerToNdc(at, this.canvas.getBoundingClientRect());
  }

  setScene(frame: SceneFrame, extent: readonly Vec3[], resetView = false): void {
    this.frame = frame;
    this.extent = extent;
    if (resetView) this.moved = false;
    if (resetView || (!this.moved && !this.following)) this.orbit = this.fitted();
  }

  setPreset(preset: CameraPresetId): void {
    this.preset = preset;
    this.moved = false;
    this.move(this.fitted());
  }

  resize(width: number, height: number): void {
    this.view = {
      width: Math.max(width, 1),
      height: Math.max(height, 1),
      insets: this.view.insets,
    };
    this.refit();
  }

  setInsets(insets: ViewInsets): void {
    const current = this.view.insets;
    if (current.top === insets.top && current.bottom === insets.bottom) return;
    this.view = { ...this.view, insets };
    this.refit();
  }

  setFollow(follow: boolean, robot: Vec3 | null): void {
    if (this.following === follow) return;
    this.following = follow;
    if (!follow) {
      this.move(this.fitted());
      return;
    }
    if (robot !== null) this.move(followOrbit(this.orbit, robot, followDistance(this.fitted())));
  }

  trackRobot(robot: Vec3, wasVisible: boolean): void {
    if (!this.following) return;
    const distance = wasVisible ? this.orbit.distance : followDistance(this.fitted());
    this.orbit = followOrbit(this.orbit, robot, distance);
  }

  drag(dx: number, dy: number): void {
    this.moved = true;
    this.move(orbitDrag(this.orbit, dx, dy));
  }

  panZoom({ dx, dy, factor, centre }: PanZoom): void {
    this.moved = true;
    const panned = orbitPan(this.orbit, { dx, dy }, { viewport: this.view, frame: this.frame });
    this.move(this.zoomAt(panned, factor, centre));
  }

  wheel(deltaY: number, at: Point): void {
    this.moved = true;
    this.move(this.zoomAt(this.orbit, Math.exp(-deltaY * WHEEL_ZOOM_PER_UNIT), at));
  }

  steer(steer: CameraSteer): void {
    this.moved = true;
    this.move(steerOrbit(this.orbit, steer, { view: this.view, frame: this.frame }));
  }

  private fitted(): OrbitState {
    const start = presetOrbit(this.preset, this.frame, this.view.width / this.view.height);
    return fitToCorners(start, this.extent, this.view, this.frame);
  }

  private refit(): void {
    if (!this.moved && !this.following) this.orbit = this.fitted();
    this.changed();
  }

  private move(next: OrbitState): void {
    this.orbit = next;
    this.changed();
  }

  private zoomAt(state: OrbitState, factor: number, at: Point): OrbitState {
    return orbitZoomAt(state, factor, this.ndc(at), { view: this.view, frame: this.frame });
  }
}
