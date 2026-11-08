import type { RenderBounds } from '../render-scene';

const DEFAULT_CLASS = 'aspect-4/3';

const SHAPES: readonly (readonly [number, string])[] = [
  [0.9, 'aspect-3/4'],
  [1.15, 'aspect-square'],
  [1.4, 'aspect-4/3'],
  [1.65, 'aspect-3/2'],
  [Infinity, 'aspect-video'],
];

export function mapAspectClass(bounds: RenderBounds): string {
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (width <= 0 || height <= 0) return DEFAULT_CLASS;
  const ratio = width / height;
  return SHAPES.find(([limit]) => ratio < limit)?.[1] ?? DEFAULT_CLASS;
}
