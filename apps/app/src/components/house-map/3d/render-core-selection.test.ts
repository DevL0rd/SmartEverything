import { BufferAttribute, BufferGeometry, Mesh, MeshLambertMaterial } from 'three';
import { describe, expect, it } from 'vitest';
import type { LayerMesh } from './render-core-layers';
import { RoomHighlight } from './render-core-selection';

function floorMesh(): LayerMesh {
  const geometry = new BufferGeometry();
  geometry.setAttribute('color', new BufferAttribute(new Float32Array(18).fill(0.2), 3));
  geometry.setIndex(new BufferAttribute(new Uint16Array([0, 1, 2, 3, 4, 5]), 1));
  return new Mesh(geometry, new MeshLambertMaterial());
}

const RANGES = [
  { roomId: 'living', firstTriangle: 0, triangleCount: 1 },
  { roomId: 'kitchen', firstTriangle: 1, triangleCount: 1 },
];

function colours(mesh: LayerMesh): readonly number[] {
  return [...mesh.geometry.getAttribute('color').array].map((value) => Math.round(value * 100));
}

describe('RoomHighlight', () => {
  it('lifts only the floor of the selected room and restores it when cleared', () => {
    const mesh = floorMesh();
    const highlight = new RoomHighlight();
    highlight.attach(mesh, RANGES);
    expect(highlight.select(['kitchen'])).toBe(true);
    expect(colours(mesh)).toEqual([...Array<number>(9).fill(20), ...Array<number>(9).fill(48)]);
    expect(highlight.select(['kitchen'])).toBe(false);
    expect(highlight.select([])).toBe(true);
    expect(colours(mesh)).toEqual(Array<number>(18).fill(20));
  });

  it('keeps the selection when the floor is rebuilt', () => {
    const highlight = new RoomHighlight();
    highlight.attach(floorMesh(), RANGES);
    highlight.select(['living']);
    const rebuilt = floorMesh();
    highlight.attach(rebuilt, RANGES);
    expect(colours(rebuilt).slice(0, 9)).toEqual(Array<number>(9).fill(48));
  });
});
