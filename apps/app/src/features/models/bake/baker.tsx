'use dom';

import { useDOMImperativeHandle } from 'expo/dom';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { ACESFilmicToneMapping, WebGLRenderer } from 'three';
import { background } from '@smarteverything/logging';
import { useStableCallback } from '../../../design/use-stable-callback';
import { createViewCamera } from '../../../components/models/three/framing';
import {
  releaseStageEnvironment,
  rendererEnvironment,
} from '../../../components/models/three/stage';
import { bakeClip, yieldTask } from './bake-clips';
import { bakeLayers, createBakeRig, targetSignals, type BakeContext } from './bake-layers';
import {
  BAKE_MESSAGE,
  BAKE_REQUEST,
  failed,
  parseJson,
  requestIdOf,
  type BakeRequest,
  type BakeResult,
  type BakerDomProps,
  type BakerHandle,
} from './bake-protocol';

const FRAME = { width: '100%', height: '100%', overflow: 'hidden' } as const;

const CANVAS = { width: '100%', height: '100%', display: 'block' } as const;

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function createBakeContext(canvas: HTMLCanvasElement): BakeContext | string {
  let renderer: WebGLRenderer;
  try {
    renderer = new WebGLRenderer({
      canvas,
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
    environment: rendererEnvironment(renderer),
    view: createViewCamera(),
    scratch: document.createElement('canvas'),
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
        ? bakeLayers(context, rig, key, signals)
        : await bakeClip({ context, rig, key }, signals, yieldTask);
    if (made === null) return failed(request.id, 'state', 'the shot is not in the model');
    return { ...made, id: request.id, ms: performance.now() - started };
  } catch (error) {
    return failed(request.id, 'render', detailOf(error));
  } finally {
    rig.dispose();
  }
}

function settle(context: BakeContext | null, text: string): Promise<BakeResult> | BakeResult {
  const id = requestIdOf(text) ?? 'unknown';
  const parsed = BAKE_REQUEST.safeParse(parseJson(text));
  if (!parsed.success) return failed(id, 'spec', parsed.error.message);
  if (context === null) return failed(id, 'webgl', 'the baker has no WebGL context');
  return runBake(context, parsed.data);
}

type Lifecycle = Pick<BakerDomProps, 'onReady' | 'onLost' | 'onUnavailable'>;

function useContext(
  events: Lifecycle,
): readonly [BakeContext | null, (canvas: HTMLCanvasElement) => () => void] {
  const [context, setContext] = useState<BakeContext | null>(null);
  const attach = useCallback(
    (canvas: HTMLCanvasElement): (() => void) => {
      const lost = (event: Event): void => {
        event.preventDefault();
        background(events.onLost('webgl_context_lost'), 'model.bake_report_failed');
      };
      canvas.addEventListener('webglcontextlost', lost);
      const made = createBakeContext(canvas);
      if (typeof made === 'string') {
        background(events.onUnavailable(made), 'model.bake_report_failed');
      } else {
        setContext(made);
      }
      return () => {
        canvas.removeEventListener('webglcontextlost', lost);
        if (typeof made !== 'string') made.dispose();
        setContext(null);
      };
    },
    [events],
  );
  return [context, attach];
}

export default function Baker(props: BakerDomProps): ReactNode {
  const { ref } = props;
  const onReady = useStableCallback(props.onReady);
  const onResult = useStableCallback(props.onResult);
  const onLost = useStableCallback(props.onLost);
  const onUnavailable = useStableCallback(props.onUnavailable);
  const events = useMemo(
    () => ({ onReady, onLost, onUnavailable }),
    [onReady, onLost, onUnavailable],
  );
  const [context, attach] = useContext(events);
  const chain = useRef<Promise<void>>(Promise.resolve());
  useDOMImperativeHandle<BakerHandle>(
    ref,
    () => ({
      bake: (...args): void => {
        const [text] = BAKE_MESSAGE.parse(args);
        chain.current = chain.current
          .then(() => settle(context, text))
          .then((result) => onResult(JSON.stringify(result)));
        background(chain.current, 'model.bake_send_failed');
      },
    }),
    [context, onResult],
  );
  useEffect(() => {
    if (context !== null) background(onReady(), 'model.bake_report_failed');
  }, [context, onReady]);
  return (
    <div style={FRAME} aria-hidden>
      <canvas ref={attach} style={CANVAS} />
    </div>
  );
}
