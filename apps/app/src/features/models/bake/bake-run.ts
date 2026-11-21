import { ACESFilmicToneMapping, WebGLRenderer } from 'three';
import { createViewCamera } from '../../../components/models/three/framing';
import {
  releaseStageEnvironment,
  rendererEnvironment,
} from '../../../components/models/three/stage';
import { bakeClip } from './bake-clips';
import { bakeLayers, createBakeRig, targetSignals, type BakeContext } from './bake-layers';
import {
  BAKE_REQUEST,
  failed,
  parseJson,
  requestIdOf,
  type BakeRequest,
  type BakeResult,
} from './bake-protocol';
import type { BakeStaging, BakeSurface } from './bake-staging';

export function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface BakeTools {
  readonly staging: BakeStaging;
  readonly pause: () => Promise<void>;
}

export function createBakeContext(source: BakeSurface, tools: BakeTools): BakeContext | string {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas: source,
      alpha: true,
      antialias: true,
      stencil: true,
      preserveDrawingBuffer: true,
    });
  } catch (error) {
    return detailOf(error);
  }
  renderer.setClearColor(0x000000, 0);
  renderer.toneMapping = ACESFilmicToneMapping;
  return {
    renderer,
    source,
    staging: tools.staging,
    pause: tools.pause,
    environment: rendererEnvironment(renderer),
    view: createViewCamera(),
    dispose: (): void => {
      releaseStageEnvironment(renderer);
      renderer.dispose();
    },
  };
}

async function runBake(context: BakeContext, request: BakeRequest): Promise<BakeResult> {
  const started = performance.now();
  const { key, spec } = request;
  const signals = targetSignals(spec, key.target);
  if (signals === null) return failed(request.id, 'state', 'no state for the bake target');
  const rig = createBakeRig(context.environment, spec, key);
  try {
    const shot = key.target.kind === 'shot' ? key.target.shotId : null;
    const made =
      shot === null
        ? await bakeLayers(context, rig, key, signals)
        : await bakeClip({ context, rig, key }, signals);
    if (made === null) return failed(request.id, 'state', 'the shot is not in the model');
    return { ...made, id: request.id, ms: performance.now() - started };
  } catch (error) {
    return failed(request.id, 'render', detailOf(error));
  } finally {
    rig.dispose();
  }
}

export function settleBake(
  context: BakeContext | null,
  text: string,
): Promise<BakeResult> | BakeResult {
  const id = requestIdOf(text) ?? 'unknown';
  const parsed = BAKE_REQUEST.safeParse(parseJson(text));
  if (!parsed.success) return failed(id, 'spec', parsed.error.message);
  if (context === null) return failed(id, 'webgl', 'the baker has no WebGL context');
  return runBake(context, parsed.data);
}
