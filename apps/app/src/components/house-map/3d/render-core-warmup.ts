import type { Camera, Object3D } from 'three';
import { background } from '@smarteverything/logging';

interface ShaderCompiler {
  compileAsync(scene: Object3D, camera: Camera): Promise<unknown>;
}

export class ShaderWarmup {
  private stale = true;
  private pending = false;

  constructor(private readonly onWarm: () => void) {}

  invalidate(): void {
    this.stale = true;
  }

  ready(compiler: ShaderCompiler, scene: Object3D, camera: Camera): boolean {
    if (this.pending) return false;
    if (!this.stale) return true;
    this.stale = false;
    this.pending = true;
    background(
      compiler.compileAsync(scene, camera).finally(() => {
        this.pending = false;
        this.onWarm();
      }),
      'house_map.shader_warmup_failed',
    );
    return false;
  }
}
