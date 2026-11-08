import { Group, Scene, type Camera, type Object3D } from 'three';
import type { Logger } from '@smarteverything/logging';
import type { FloorLighting } from '../lighting';
import { FULL_QUALITY, type QualitySettings } from '../live-visibility/quality-scaler';
import type { RenderFloor } from '../render-scene';
import type { ScanBand, ScanPlacementWire, ScanSource } from './map-3d-protocol';
import { RealisticLayer, type ScanPort } from './splat/realistic-layer';
import type { RelightInput } from './splat/relight';

export interface RealisticHook {
  readonly setScan: (source: ScanSource | null) => void;
  readonly setPlacement: (placement: ScanPlacementWire) => void;
  readonly setBand: (band: ScanBand | null) => void;
  readonly setFloor: (sceneKey: string, floor: RenderFloor) => void;
  readonly setLighting: (lighting: FloorLighting) => void;
}

export interface RelightPort {
  readonly edits: Object3D;
  setActive(active: boolean): boolean;
  update(input: RelightInput): boolean;
  compose(camera: Camera, width: number, height: number): boolean;
  dispose(): void;
}

export interface RealisticRenderer {
  render(scene: Object3D, camera: Camera): void;
}

export interface RealisticViewOptions {
  readonly createPort: () => ScanPort;
  readonly createRelight: () => RelightPort;
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  readonly structure: Object3D;
  readonly log: Pick<Logger, 'info' | 'warn'>;
  readonly onChange: () => void;
  readonly onFailed: (detail: string) => void;
}

interface ShownFloor {
  readonly sceneKey: string;
  readonly floor: RenderFloor;
}

export interface ViewSize {
  readonly width: number;
  readonly height: number;
}

export class RealisticView implements RealisticHook {
  readonly scene = new Scene();
  private readonly lift = new Group();
  private readonly layer: RealisticLayer;
  private relight: RelightPort | null = null;
  private shown = false;
  private active = false;
  private loaded = false;
  private floor: ShownFloor | null = null;
  private lighting: FloorLighting | null = null;
  private quality: QualitySettings = FULL_QUALITY;

  constructor(private readonly options: RealisticViewOptions) {
    this.layer = new RealisticLayer({
      createPort: options.createPort,
      fetchBytes: options.fetchBytes,
      log: options.log,
      onLoaded: (): void => {
        this.loaded = true;
        this.refresh(true);
      },
      onFailed: (detail): void => {
        this.loaded = false;
        this.refresh(true);
        options.onFailed(detail);
      },
    });
    this.lift.name = 'realistic-lift';
    this.lift.add(this.layer.group);
    this.scene.add(this.lift);
  }

  drawn(): boolean {
    return this.shown && this.active && this.loaded && this.layer.holdsRenderer();
  }

  holdsRelight(): boolean {
    return this.relight !== null;
  }

  setView(realistic: boolean): void {
    if (this.shown === realistic) return;
    this.shown = realistic;
    this.open();
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    this.open();
  }

  setScan(source: ScanSource | null): void {
    if (!this.layer.setScan(source)) return;
    this.loaded = false;
    this.refresh(true);
  }

  setPlacement(placement: ScanPlacementWire): void {
    this.layer.setPlacement(placement);
    this.refresh(this.drawn());
  }

  setBand(band: ScanBand | null): void {
    this.layer.setBand(band);
    this.lift.position.y = band === null ? 0 : -Math.min(band.bottom, band.top);
    this.refresh(this.drawn());
  }

  setFloor(sceneKey: string, floor: RenderFloor): void {
    if (this.floor?.sceneKey === sceneKey && this.floor.floor === floor) return;
    this.floor = { sceneKey, floor: { ...floor, elevation: 0 } };
    this.refresh(false);
  }

  setLighting(lighting: FloorLighting): void {
    this.lighting = lighting;
    this.refresh(false);
  }

  setQuality(quality: QualitySettings): void {
    this.quality = quality;
    this.layer.setSplatScale(quality.splatScale);
    this.refresh(false);
  }

  render(renderer: RealisticRenderer, camera: Camera, size: ViewSize): boolean {
    if (!this.drawn()) return false;
    renderer.render(this.scene, camera);
    this.relight?.compose(camera, size.width, size.height);
    return true;
  }

  dispose(): void {
    this.layer.dispose();
    this.dropRelight();
  }

  private open(): void {
    const open = this.shown && this.active;
    if (!open) this.loaded = false;
    this.layer.setActive(open);
    this.refresh(true);
  }

  private refresh(changed: boolean): void {
    const drawn = this.drawn();
    const structureChanged = this.options.structure.visible === drawn;
    this.options.structure.visible = !drawn;
    const relit = this.updateRelight(drawn);
    if (changed || structureChanged || relit) this.options.onChange();
  }

  private updateRelight(drawn: boolean): boolean {
    const { floor, lighting } = this;
    if (!drawn || floor === null || lighting?.enabled !== true) return this.dropRelight();
    const created = this.relight === null;
    const relight = this.relight ?? this.createRelight();
    const activated = relight.setActive(true);
    const updated = relight.update({ ...floor, lighting, quality: this.quality });
    return created || activated || updated;
  }

  private createRelight(): RelightPort {
    const relight = this.options.createRelight();
    this.scene.add(relight.edits);
    this.relight = relight;
    return relight;
  }

  private dropRelight(): boolean {
    if (this.relight === null) return false;
    this.relight.dispose();
    this.relight = null;
    return true;
  }
}
