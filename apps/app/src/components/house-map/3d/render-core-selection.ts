import type { RoomRange } from './vacuum-geometry';
import type { LayerMesh } from './render-core-layers';

const SELECTED_LIFT = 0.35;

interface TriangleIndex {
  getX(corner: number): number;
}

function sameSet(left: ReadonlySet<string>, right: ReadonlySet<string>): boolean {
  return left.size === right.size && [...left].every((id) => right.has(id));
}

function selectedVertices(
  ranges: readonly RoomRange[],
  selected: ReadonlySet<string>,
  index: TriangleIndex,
): ReadonlySet<number> {
  const vertices = new Set<number>();
  for (const range of ranges) {
    if (!selected.has(range.roomId)) continue;
    const end = (range.firstTriangle + range.triangleCount) * 3;
    for (let corner = range.firstTriangle * 3; corner < end; corner += 1) {
      vertices.add(index.getX(corner));
    }
  }
  return vertices;
}

function paintedColours(plain: Float32Array, vertices: ReadonlySet<number>): Float32Array {
  const painted = Float32Array.from(plain);
  for (const vertex of vertices) {
    for (let channel = vertex * 3; channel < vertex * 3 + 3; channel += 1) {
      const value = painted[channel] ?? 0;
      painted[channel] = value + (1 - value) * SELECTED_LIFT;
    }
  }
  return painted;
}

export class RoomHighlight {
  private mesh: LayerMesh | null = null;
  private plain: Float32Array | null = null;
  private ranges: readonly RoomRange[] = [];
  private selected: ReadonlySet<string> = new Set();

  attach(mesh: LayerMesh | null, ranges: readonly RoomRange[]): void {
    this.mesh = mesh;
    this.ranges = ranges;
    const colour = mesh?.geometry.getAttribute('color');
    this.plain = colour === undefined ? null : Float32Array.from(colour.array);
    this.paint();
  }

  select(roomIds: readonly string[]): boolean {
    const next = new Set(roomIds);
    if (sameSet(next, this.selected)) return false;
    this.selected = next;
    this.paint();
    return true;
  }

  private paint(): void {
    const colour = this.mesh?.geometry.getAttribute('color');
    const index = this.mesh?.geometry.getIndex() ?? null;
    if (this.plain === null || colour === undefined || index === null) return;
    colour.array.set(
      paintedColours(this.plain, selectedVertices(this.ranges, this.selected, index)),
    );
    colour.needsUpdate = true;
  }
}
