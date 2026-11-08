import { BufferGeometry, Float32BufferAttribute } from 'three';

export interface GlowShape {
  readonly width: number;
  readonly height: number;
  readonly around: number;
}

export function glowRings(around: number): number {
  return Math.max(3, Math.round(around / 4));
}

export function glowFalloff(t: number): number {
  const inside = Math.min(1, Math.max(0, 1 - t * t));
  return inside * inside;
}

function vertexAt(shape: GlowShape, t: number, step: number): readonly [number, number] {
  const angle = (step / shape.around) * Math.PI * 2;
  return [(Math.cos(angle) * shape.width * t) / 2, (Math.sin(angle) * shape.height * t) / 2];
}

function glowIndex(around: number, rings: number): number[] {
  const index: number[] = [];
  const at = (ring: number, step: number): number => 1 + (ring - 1) * around + (step % around);
  for (let step = 0; step < around; step += 1) index.push(0, at(1, step), at(1, step + 1));
  for (let ring = 1; ring < rings; ring += 1) {
    for (let step = 0; step < around; step += 1) {
      const [a, b, c, d] = [
        at(ring, step),
        at(ring, step + 1),
        at(ring + 1, step),
        at(ring + 1, step + 1),
      ];
      index.push(a, c, b, b, c, d);
    }
  }
  return index;
}

export function glowGeometry(shape: GlowShape): BufferGeometry {
  const rings = glowRings(shape.around);
  const positions = [0, 0, 0];
  const uvs = [0.5, 0.5];
  const colours = [1, 1, 1, glowFalloff(0)];
  for (let ring = 1; ring <= rings; ring += 1) {
    const t = ring / rings;
    for (let step = 0; step < shape.around; step += 1) {
      const [x, y] = vertexAt(shape, t, step);
      positions.push(x, y, 0);
      uvs.push(0.5 + x / shape.width, 0.5 + y / shape.height);
      colours.push(1, 1, 1, glowFalloff(t));
    }
  }
  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new Float32BufferAttribute(colours, 4));
  geometry.setIndex(glowIndex(shape.around, rings));
  geometry.computeVertexNormals();
  return geometry;
}
