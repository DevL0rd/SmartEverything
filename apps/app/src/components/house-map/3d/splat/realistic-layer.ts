import { SplatMesh } from '@sparkjsdev/spark';
import { Group, type Object3D } from 'three';
import { background, type Logger } from '@smarteverything/logging';
import type { ScanBand, ScanPlacementWire, ScanSource } from '../map-3d-protocol';
import {
  SplatScanLayer,
  type LoadedScan,
  type ScanFileFormat,
  type ScanLayerOptions,
  type ScanPlacement,
} from './spark-loader';

export interface ScanPort {
  readonly group: Object3D;
  load(bytes: Uint8Array, format: ScanFileFormat): Promise<LoadedScan>;
  setPlacement(placement: ScanPlacement): void;
  setBand(band: ScanBand | null): void;
  setSplatScale(scale: number): void;
  setOpacity(opacity: number): void;
  dispose(): void;
}

export interface RealisticLayerOptions {
  readonly createPort: () => ScanPort;
  readonly fetchBytes: (url: string) => Promise<Uint8Array>;
  readonly log: Pick<Logger, 'info' | 'warn'>;
  readonly onLoaded: (loaded: LoadedScan) => void;
  readonly onFailed: (detail: string) => void;
}

export class ScanFetchError extends Error {
  override readonly name = 'ScanFetchError';
}

export async function fetchScanBytes(url: string): Promise<Uint8Array> {
  const response = await fetch(url);
  if (!response.ok) throw new ScanFetchError(`The scan file answered ${String(response.status)}`);
  return new Uint8Array(await response.arrayBuffer());
}

export function sparkScanPort(options: ScanLayerOptions): ScanPort {
  const layer = new SplatScanLayer(options);
  return {
    group: layer.group,
    load: (bytes, format): Promise<LoadedScan> => layer.load(bytes, format),
    setPlacement: (placement): void => {
      layer.setPlacement(placement);
    },
    setBand: (band): void => {
      layer.setBand(band);
    },
    setSplatScale: (scale): void => {
      layer.setSplatScale(scale);
    },
    setOpacity: (opacity): void => {
      for (const child of layer.group.children) {
        if (child instanceof SplatMesh) child.opacity = opacity;
      }
      options.onDirty();
    },
    dispose: (): void => {
      layer.dispose();
    },
  };
}

export function scanPlacementInWorld(wire: ScanPlacementWire): ScanPlacement {
  return { x: wire.tx, y: wire.tz, z: -wire.ty, yawDeg: wire.yawDeg, scale: wire.scale };
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export const SCAN_DOWNLOAD_PROBLEM =
  'The scan file couldn’t be downloaded from the hub. Try again in a moment.';

export const SCAN_OPEN_PROBLEM =
  'The scan file couldn’t be opened. It may be damaged, or saved in a way this app can’t read.';

export function scanProblemOf(error: unknown): string {
  return error instanceof ScanFetchError ? SCAN_DOWNLOAD_PROBLEM : SCAN_OPEN_PROBLEM;
}

export class RealisticLayer {
  readonly group = new Group();
  private port: ScanPort | null = null;
  private source: ScanSource | null = null;
  private placement: ScanPlacementWire | null = null;
  private band: ScanBand | null = null;
  private splatScale = 1;
  private active = false;
  private failed = false;
  private loading = 0;

  constructor(private readonly options: RealisticLayerOptions) {
    this.group.name = 'realistic-layer';
  }

  holdsRenderer(): boolean {
    return this.port !== null;
  }

  setActive(active: boolean): void {
    if (this.active === active) return;
    this.active = active;
    if (active) this.open();
    else this.close();
  }

  setScan(source: ScanSource | null): boolean {
    if (this.source?.key === source?.key && !this.failed) return false;
    this.source = source;
    this.close();
    this.open();
    return true;
  }

  setPlacement(placement: ScanPlacementWire): void {
    this.placement = placement;
    this.applyPlacement();
  }

  setBand(band: ScanBand | null): void {
    this.band = band;
    this.port?.setBand(band);
  }

  setSplatScale(scale: number): void {
    this.splatScale = scale;
    this.port?.setSplatScale(scale);
  }

  dispose(): void {
    this.active = false;
    this.close();
    this.group.removeFromParent();
  }

  private open(): void {
    this.failed = false;
    if (!this.active || this.source === null || this.port !== null) return;
    const port = this.options.createPort();
    this.port = port;
    this.group.add(port.group);
    port.setSplatScale(this.splatScale);
    port.setBand(this.band);
    this.loading += 1;
    background(this.load(port, this.source, this.loading), 'house_map.scan_load_crashed');
  }

  private close(): void {
    this.loading += 1;
    if (this.port === null) return;
    this.group.remove(this.port.group);
    this.port.dispose();
    this.port = null;
  }

  private current(port: ScanPort, attempt: number): boolean {
    return this.port === port && this.loading === attempt;
  }

  private async load(port: ScanPort, source: ScanSource, attempt: number): Promise<void> {
    try {
      const bytes = await this.options.fetchBytes(source.url);
      if (!this.current(port, attempt)) return;
      const loaded = await port.load(bytes, source.format);
      if (!this.current(port, attempt)) return;
      this.applyPlacement();
      this.options.onLoaded(loaded);
    } catch (error) {
      if (!this.current(port, attempt)) return;
      this.failed = true;
      this.options.log.warn('house_map.scan_load_failed', {
        format: source.format,
        detail: detailOf(error),
      });
      this.options.onFailed(scanProblemOf(error));
    }
  }

  private applyPlacement(): void {
    if (this.port === null || this.placement === null) return;
    this.port.setPlacement(scanPlacementInWorld(this.placement));
    this.port.setOpacity(this.placement.opacity);
  }
}
