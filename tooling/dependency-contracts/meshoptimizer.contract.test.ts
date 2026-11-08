import { MeshoptSimplifier } from 'meshoptimizer/simplifier';
import { describe, expect, it } from 'vitest';
import { declaredVersion, HUB_MANIFEST } from './contract-helpers';
import { installedVersion } from './versions';

const SIDE = 20;

function grid(): { indices: Uint32Array; positions: Float32Array } {
  const row = SIDE + 1;
  const positions = new Float32Array(row * row * 3);
  for (let y = 0; y < row; y += 1) {
    for (let x = 0; x < row; x += 1) {
      positions.set([x, y, Math.sin(x / 3) * Math.cos(y / 3)], (y * row + x) * 3);
    }
  }
  const indices: number[] = [];
  for (let y = 0; y < SIDE; y += 1) {
    for (let x = 0; x < SIDE; x += 1) {
      const a = y * row + x;
      indices.push(a, a + 1, a + row, a + 1, a + row + 1, a + row);
    }
  }
  return { indices: Uint32Array.from(indices), positions };
}

describe('meshoptimizer contract', () => {
  it('is declared by the hub at the installed version', () => {
    expect(declaredVersion(HUB_MANIFEST, 'meshoptimizer')).toBe(installedVersion('meshoptimizer'));
  });

  it('runs its bundled WebAssembly without a download', async () => {
    await MeshoptSimplifier.ready;

    expect(MeshoptSimplifier.supported).toBe(true);
  });

  it('simplifies an index buffer down to the target index count over the same vertices', async () => {
    await MeshoptSimplifier.ready;
    const { indices, positions } = grid();
    const goal = 300;

    const [result, error] = MeshoptSimplifier.simplify(indices, positions, 3, goal, 1);

    expect(result.length).toBeLessThanOrEqual(goal);
    expect(result.length).toBeGreaterThan(0);
    expect(result.length % 3).toBe(0);
    expect(Math.max(...result)).toBeLessThan(positions.length / 3);
    expect(error).toBeGreaterThan(0);
  });

  it('returns the input triangle count when the target asks for no reduction', async () => {
    await MeshoptSimplifier.ready;
    const { indices, positions } = grid();

    const [result] = MeshoptSimplifier.simplify(indices, positions, 3, indices.length, 1);

    expect(result.length).toBe(indices.length);
  });
});
