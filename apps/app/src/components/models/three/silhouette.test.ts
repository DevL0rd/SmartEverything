import {
  AlwaysStencilFunc,
  BoxGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  NotEqualStencilFunc,
  ReplaceStencilOp,
} from 'three';
import { describe, expect, it } from 'vitest';
import { createSilhouette, SILHOUETTE_ORDER, SILHOUETTE_STENCIL } from './silhouette';
import { STAGE_RIGS } from './stage';

function luminance(hex: string): number {
  const value = Number.parseInt(hex.slice(1), 16);
  const lin = (channel: number): number => {
    const c = channel / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(value >> 16) + 0.7152 * lin((value >> 8) & 255) + 0.0722 * lin(value & 255);
}

function contrast(a: string, b: string): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return ((hi ?? 0) + 0.05) / ((lo ?? 0) + 0.05);
}

describe('silhouette edge', () => {
  it('reaches 3:1 against the stage surface in both themes', () => {
    for (const rig of Object.values(STAGE_RIGS)) {
      expect(contrast(rig.edge, rig.surface)).toBeGreaterThanOrEqual(3);
    }
  });

  it('marks every solid mesh and draws one edge hull outside its stencil', () => {
    const root = new Group();
    const body = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    const lid = new Mesh(new BoxGeometry(), new MeshStandardMaterial());
    body.add(lid);
    root.add(body);
    const edge = createSilhouette(root, 'light');
    expect(edge.hulls).toHaveLength(2);
    expect(body.material.stencilWrite).toBe(true);
    expect(body.material.stencilFunc).toBe(AlwaysStencilFunc);
    expect(body.material.stencilZPass).toBe(ReplaceStencilOp);
    expect(edge.material.stencilFunc).toBe(NotEqualStencilFunc);
    expect(edge.material.stencilRef).toBe(SILHOUETTE_STENCIL);
    expect(edge.material.stencilZPass).toBe(ReplaceStencilOp);
    expect(edge.hulls[0]?.renderOrder).toBe(SILHOUETTE_ORDER);
    expect(edge.hulls[0]?.geometry).toBe(body.geometry);
    const light = edge.uniforms.tone.value.getHexString();
    edge.setTheme('dark');
    expect(edge.uniforms.tone.value.getHexString()).not.toBe(light);
    edge.dispose();
    expect(body.children).toEqual([lid]);
  });
});
