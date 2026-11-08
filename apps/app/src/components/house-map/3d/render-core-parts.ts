import { DirectionalLight, HemisphereLight, type Object3D, type WebGLRenderer } from 'three';
import { Logger } from '@smarteverything/logging';
import { RealisticView } from './render-core-realistic';
import { fetchScanBytes, sparkScanPort } from './splat/realistic-layer';
import { Relight } from './splat/relight';

const log = new Logger('app.house-map');

export function sceneLights(): readonly [HemisphereLight, DirectionalLight] {
  const sun = new DirectionalLight(0xffffff, 1.8);
  sun.position.set(4, 8, 3);
  return [new HemisphereLight(0xffffff, 0x8a8a8a, 1.6), sun];
}

export interface RealisticHooks {
  readonly renderer: WebGLRenderer;
  readonly structure: Object3D;
  readonly onChange: () => void;
  readonly onFailed: (detail: string) => void;
}

export function realisticViewOf(hooks: RealisticHooks): RealisticView {
  const { renderer, structure, onChange, onFailed } = hooks;
  return new RealisticView({
    createPort: () => sparkScanPort({ renderer, onDirty: onChange, log }),
    createRelight: () => new Relight(renderer),
    fetchBytes: fetchScanBytes,
    structure,
    log,
    onChange,
    onFailed,
  });
}
