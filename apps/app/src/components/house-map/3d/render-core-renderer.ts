import { WebGLRenderer } from 'three';
import { clampPixelRatio } from './render-core-orbit';

export function canvasPixelRatio(ratio: number, renderScale: number): number {
  return clampPixelRatio(ratio) * renderScale;
}

export function applyPixelRatio(
  renderer: Pick<WebGLRenderer, 'getPixelRatio' | 'setPixelRatio'>,
  ratio: number,
  renderScale: number,
): boolean {
  const next = canvasPixelRatio(ratio, renderScale);
  if (renderer.getPixelRatio() === next) return false;
  renderer.setPixelRatio(next);
  return true;
}

interface RestingRenderer {
  setRenderTarget(target: null): void;
  setClearColor(color: number, alpha: number): void;
  setSize(width: number, height: number, updateStyle: boolean): void;
  readonly shadowMap: { enabled: boolean };
}

export function restRenderer(renderer: RestingRenderer): void {
  const { shadowMap } = renderer;
  renderer.setRenderTarget(null);
  renderer.setClearColor(0x000000, 0);
  shadowMap.enabled = false;
  renderer.setSize(1, 1, false);
}

export class WebglUnavailableError extends Error {
  constructor(cause: unknown) {
    super('WebGL is not available', { cause });
    this.name = 'WebglUnavailableError';
  }
}

export function createRenderer(canvas: HTMLCanvasElement): WebGLRenderer {
  try {
    const renderer = new WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      powerPreference: 'low-power',
    });
    renderer.setClearColor(0x000000, 0);
    return renderer;
  } catch (error) {
    throw new WebglUnavailableError(error);
  }
}
