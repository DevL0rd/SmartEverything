import { BufferAttribute, type Mesh } from 'three';
import {
  cutPositions,
  cutWalls,
  sameCut,
  type CutView,
  type WallSpan,
  type WallStyle,
} from './cutaway';
import type { MeshLayer, SceneGeometry } from './vacuum-geometry';
import type { WallView } from './wall-mounts';

export interface WallLook {
  readonly style: WallStyle;
  readonly cutHeight: number;
  readonly lowHeight: number;
}

export class WallCutaway {
  private cut: readonly boolean[] = [];
  private readonly attribute: BufferAttribute | null;

  constructor(
    mesh: Mesh | null,
    private readonly layer: MeshLayer | null,
    private readonly spans: readonly WallSpan[],
    private readonly look: WallLook,
  ) {
    this.attribute =
      layer === null ? null : new BufferAttribute(Float32Array.from(layer.positions), 3);
    if (this.attribute !== null) mesh?.geometry.setAttribute('position', this.attribute);
  }

  static of(geometry: SceneGeometry, mesh: Mesh | null): WallCutaway {
    const layer = geometry.base.find((candidate) => candidate.id === 'walls') ?? null;
    return new WallCutaway(mesh, layer, geometry.walls, {
      style: geometry.wallStyle,
      cutHeight: geometry.cutHeight,
      lowHeight: geometry.lowWallHeight,
    });
  }

  update(view: CutView, full: ReadonlySet<string>): boolean {
    if (this.layer === null || this.attribute === null) return false;
    const next = cutWalls(this.spans, view, this.cut, full);
    if (sameCut(next, this.cut)) return false;
    this.cut = next;
    this.attribute.copyArray(
      cutPositions(this.layer.positions, this.spans, { walls: next, height: this.look.cutHeight }),
    );
    this.attribute.needsUpdate = true;
    return true;
  }

  view(): WallView {
    return {
      style: this.look.style,
      cutIds: new Set(
        this.spans.flatMap((span, index) => (this.cut[index] === true ? [span.wallId] : [])),
      ),
      lowHeight: this.look.lowHeight,
    };
  }

  pickLayer(): MeshLayer | null {
    if (this.layer === null || this.attribute === null) return null;
    return {
      ...this.layer,
      positions: cutPositions(this.layer.positions, this.spans, {
        walls: this.cut,
        height: this.look.cutHeight,
      }),
    };
  }
}
