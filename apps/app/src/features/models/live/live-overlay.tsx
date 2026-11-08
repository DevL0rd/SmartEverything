'use dom';

import type { ModelSpec } from '@smarteverything/domain';
import { useDOMImperativeHandle } from 'expo/dom';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { ACESFilmicToneMapping, WebGLRenderer } from 'three';
import { background } from '@smarteverything/logging';
import { useStableCallback } from '../../../design/use-stable-callback';
import { parseJson } from '../bake/bake-protocol';
import {
  releaseStageEnvironment,
  rendererEnvironment,
} from '../../../components/models/three/stage';
import { browserScheduler, createFrameLoop, type FrameLoop } from './frame-loop';
import { syncCanvasViews } from './live-canvas';
import {
  LIVE_MESSAGE,
  LIVE_PLACE,
  LIVE_SYNC,
  readSync,
  type LiveOverlayDomProps,
  type LiveOverlayHandle,
} from './live-protocol';
import { createLiveRenderer, type LiveRenderer } from './renderer-core';
import { PaintAcknowledgement } from './route-paint';

const FRAME = { width: '100%', height: '100%', overflow: 'hidden', background: 'transparent' };

const CANVAS = { width: '100%', height: '100%', display: 'block' } as const;

interface Overlay {
  readonly renderer: LiveRenderer;
  readonly loop: FrameLoop;
  readonly specs: Map<string, ModelSpec>;
  readonly size: { width: number; height: number; dpr: number };
  readonly dispose: () => void;
  readonly paint: PaintAcknowledgement;
}

function detailOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function startOverlay(
  canvas: HTMLCanvasElement,
  onDrawn: (generation: number, ids: readonly string[]) => void,
): Overlay {
  const gl = new WebGLRenderer({ canvas, alpha: true, antialias: true, stencil: true });
  gl.setClearColor(0x000000, 0);
  gl.toneMapping = ACESFilmicToneMapping;
  const renderer = createLiveRenderer(gl, rendererEnvironment(gl));
  const paint = new PaintAcknowledgement();
  const loop = createFrameLoop({
    scheduler: browserScheduler(),
    step: (nowMs) => {
      const { moving, drawn } = renderer.draw(nowMs);
      if (paint.acknowledge(drawn)) onDrawn(paint.generation, drawn);
      return moving;
    },
    onFrameTime: renderer.recordFrame,
  });
  return {
    renderer,
    loop,
    paint,
    specs: new Map(),
    size: { width: 0, height: 0, dpr: 1 },
    dispose: (): void => {
      loop.dispose();
      renderer.dispose();
      releaseStageEnvironment(gl);
      gl.dispose();
      gl.forceContextLoss();
    },
  };
}

function applySync(overlay: Overlay, text: string): void {
  const sync = LIVE_SYNC.parse(parseJson(text));
  const views = readSync(sync, overlay.specs);
  overlay.paint.sync(
    sync.generation,
    views.map((view) => view.id),
  );
  syncCanvasViews(overlay.renderer, overlay.loop, views);
}

function applyPlace(overlay: Overlay, text: string): void {
  const place = LIVE_PLACE.parse(parseJson(text));
  const { size, renderer } = overlay;
  if (size.width !== place.width || size.height !== place.height || size.dpr !== place.dpr) {
    Object.assign(size, { width: place.width, height: place.height, dpr: place.dpr });
    renderer.resize(place.width, place.height, place.dpr);
  }
  for (const [id, { rect, clip }] of Object.entries(place.placements)) {
    renderer.place(id, rect, clip);
  }
  overlay.loop.invalidate();
}

type Lifecycle = Pick<LiveOverlayDomProps, 'onLost' | 'onUnavailable'> & {
  readonly drawn: (generation: number, ids: readonly string[]) => void;
};

function useOverlay(
  events: Lifecycle,
): readonly [Overlay | null, (canvas: HTMLCanvasElement) => () => void] {
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const attach = useCallback(
    (canvas: HTMLCanvasElement): (() => void) => {
      const lost = (event: Event): void => {
        event.preventDefault();
        background(events.onLost('webgl_context_lost'), 'model.live_report_failed');
      };
      canvas.addEventListener('webglcontextlost', lost);
      let made: Overlay | null = null;
      try {
        made = startOverlay(canvas, events.drawn);
        setOverlay(made);
      } catch (error) {
        background(events.onUnavailable(detailOf(error)), 'model.live_report_failed');
      }
      return (): void => {
        canvas.removeEventListener('webglcontextlost', lost);
        made?.dispose();
        setOverlay(null);
      };
    },
    [events],
  );
  return [overlay, attach];
}

export default function LiveOverlay(props: LiveOverlayDomProps): ReactNode {
  const { ref } = props;
  const onReady = useStableCallback(props.onReady);
  const onDrawn = useStableCallback(props.onDrawn);
  const onLost = useStableCallback(props.onLost);
  const onUnavailable = useStableCallback(props.onUnavailable);
  const events = useMemo(
    () => ({
      onLost,
      onUnavailable,
      drawn: (generation: number, ids: readonly string[]): void => {
        background(onDrawn(generation, ids), 'model.live_report_failed');
      },
    }),
    [onLost, onUnavailable, onDrawn],
  );
  const [overlay, attach] = useOverlay(events);
  useDOMImperativeHandle<LiveOverlayHandle>(
    ref,
    () => ({
      sync: (...args): void => {
        const [text] = LIVE_MESSAGE.parse(args);
        if (overlay !== null) applySync(overlay, text);
      },
      place: (...args): void => {
        const [text] = LIVE_MESSAGE.parse(args);
        if (overlay !== null) applyPlace(overlay, text);
      },
    }),
    [overlay],
  );
  useEffect(() => {
    document.body.style.background = 'transparent';
    if (overlay !== null) background(onReady(), 'model.live_report_failed');
  }, [overlay, onReady]);
  return (
    <div style={FRAME} aria-hidden>
      <canvas ref={attach} style={CANVAS} />
    </div>
  );
}
