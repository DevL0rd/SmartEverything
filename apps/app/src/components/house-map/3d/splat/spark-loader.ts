import {
  SparkRenderer,
  SplatEdit,
  SplatEditRgbaBlendMode,
  SplatEditSdf,
  SplatEditSdfType,
  SplatFileType,
  SplatMesh,
} from '@sparkjsdev/spark';
import { Group, MathUtils, type Object3D, type WebGLRenderer } from 'three';
import type { Logger } from '@smarteverything/logging';

export type ScanFileFormat = 'ply' | 'splat' | 'spz' | 'rad';

export interface ScanPlacement {
  readonly x: number;
  readonly y: number;
  readonly z: number;
  readonly yawDeg: number;
  readonly scale: number;
}

export interface HeightBand {
  readonly bottom: number;
  readonly top: number;
}

export interface LoadedScan {
  readonly splats: number;
  readonly loadMs: number;
}

export interface ScanLayerOptions {
  readonly renderer: WebGLRenderer;
  readonly onDirty: () => void;
  readonly log: Pick<Logger, 'info'>;
}

const FILE_TYPES: Readonly<Record<ScanFileFormat, SplatFileType>> = {
  ply: SplatFileType.PLY,
  splat: SplatFileType.SPLAT,
  spz: SplatFileType.SPZ,
  rad: SplatFileType.RAD,
};

const BAND_SOFT_EDGE_M = 0.02;

const QUARTER_TURN = Math.PI / 2;

export function sparkFileType(format: ScanFileFormat): SplatFileType {
  return FILE_TYPES[format];
}

export function applyPlacement(target: Object3D, placement: ScanPlacement): void {
  target.position.set(placement.x, placement.y, placement.z);
  target.rotation.set(0, MathUtils.degToRad(placement.yawDeg), 0);
  target.scale.setScalar(placement.scale);
  target.updateMatrixWorld(true);
}

function halfSpace(height: number, facingUp: boolean): SplatEditSdf {
  const plane = new SplatEditSdf({ type: SplatEditSdfType.PLANE, opacity: 0 });
  plane.position.set(0, height, 0);
  plane.rotation.set(facingUp ? -QUARTER_TURN : QUARTER_TURN, 0, 0);
  plane.updateMatrixWorld(true);
  return plane;
}

export function createBandEdit(band: HeightBand): SplatEdit {
  const bottom = Math.min(band.bottom, band.top);
  const top = Math.max(band.bottom, band.top);
  return new SplatEdit({
    name: 'scan-floor-band',
    rgbaBlendMode: SplatEditRgbaBlendMode.MULTIPLY,
    softEdge: BAND_SOFT_EDGE_M,
    sdfs: [halfSpace(bottom, true), halfSpace(top, false)],
  });
}

function heldSplats(mesh: SplatMesh): number {
  return mesh.packedSplats?.lodSplats?.numSplats ?? mesh.numSplats;
}

export class SplatScanLayer {
  readonly group = new Group();
  private readonly spark: SparkRenderer;
  private readonly log: Pick<Logger, 'info'>;
  private readonly onDirty: () => void;
  private mesh: SplatMesh | null = null;
  private bandEdit: SplatEdit | null = null;

  constructor(options: ScanLayerOptions) {
    this.log = options.log;
    this.onDirty = options.onDirty;
    this.spark = new SparkRenderer({ renderer: options.renderer, onDirty: options.onDirty });
    this.group.name = 'scan-layer';
    this.group.add(this.spark);
  }

  async load(bytes: Uint8Array, format: ScanFileFormat): Promise<LoadedScan> {
    const started = performance.now();
    this.removeMesh();
    const mesh = new SplatMesh({ fileBytes: bytes, fileType: sparkFileType(format), lod: true });
    this.mesh = mesh;
    this.group.add(mesh);
    await mesh.initialized;
    const loaded = { splats: heldSplats(mesh), loadMs: performance.now() - started };
    this.log.info('house_map.scan_loaded', { format, bytes: bytes.byteLength, ...loaded });
    this.onDirty();
    return loaded;
  }

  setPlacement(placement: ScanPlacement): void {
    if (this.mesh === null) return;
    applyPlacement(this.mesh, placement);
    this.onDirty();
  }

  setBand(band: HeightBand | null): void {
    if (this.bandEdit !== null) this.group.remove(this.bandEdit);
    this.bandEdit = band === null ? null : createBandEdit(band);
    if (this.bandEdit !== null) this.group.add(this.bandEdit);
    this.onDirty();
  }

  setSplatScale(scale: number): void {
    if (this.spark.lodSplatScale === scale) return;
    this.spark.lodSplatScale = scale;
    this.onDirty();
  }

  splatScale(): number {
    return this.spark.lodSplatScale;
  }

  dispose(): void {
    this.removeMesh();
    this.setBand(null);
    this.group.remove(this.spark);
    this.spark.dispose();
  }

  private removeMesh(): void {
    if (this.mesh === null) return;
    this.group.remove(this.mesh);
    this.mesh.dispose();
    this.mesh = null;
  }
}
