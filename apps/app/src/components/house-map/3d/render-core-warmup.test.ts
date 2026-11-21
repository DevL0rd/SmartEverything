import { Object3D, PerspectiveCamera } from 'three';
import { describe, expect, it, vi } from 'vitest';
import { ShaderWarmup } from './render-core-warmup';

function deferred(): { readonly promise: Promise<Object3D>; readonly resolve: () => void } {
  let resolve = (): void => undefined;
  const promise = new Promise<Object3D>((done) => {
    resolve = (): void => {
      done(new Object3D());
    };
  });
  return { promise, resolve };
}

describe('shader warmup', () => {
  it('holds the first draw until the scene compiled, then draws without compiling again', async () => {
    const compile = deferred();
    const compiler = { compileAsync: vi.fn(() => compile.promise) };
    const warm = vi.fn();
    const warmup = new ShaderWarmup(warm);
    const scene = new Object3D();
    const camera = new PerspectiveCamera();
    expect(warmup.ready(compiler, scene, camera)).toBe(false);
    expect(warmup.ready(compiler, scene, camera)).toBe(false);
    expect(compiler.compileAsync).toHaveBeenCalledOnce();
    compile.resolve();
    await compile.promise;
    await Promise.resolve();
    expect(warm).toHaveBeenCalledOnce();
    expect(warmup.ready(compiler, scene, camera)).toBe(true);
    expect(compiler.compileAsync).toHaveBeenCalledOnce();
  });

  it('compiles again only after the scene changed', async () => {
    const compiler = { compileAsync: vi.fn(() => Promise.resolve(new Object3D())) };
    const warmup = new ShaderWarmup(vi.fn());
    const scene = new Object3D();
    const camera = new PerspectiveCamera();
    warmup.ready(compiler, scene, camera);
    await Promise.resolve();
    await Promise.resolve();
    expect(warmup.ready(compiler, scene, camera)).toBe(true);
    warmup.invalidate();
    expect(warmup.ready(compiler, scene, camera)).toBe(false);
    expect(compiler.compileAsync).toHaveBeenCalledTimes(2);
  });
});
