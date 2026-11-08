import { Logger } from '@smarteverything/logging';
import { createFrameLoop, type FrameLoop, type FrameScheduler } from './frame-loop';
import type { LiveSurface } from './live-surface';
import { syncLive, type LiveRenderer, type LiveViewModel } from './renderer-core';

const log = new Logger('app.models');

export interface CanvasGraphics {
  readonly renderer: LiveRenderer;
  readonly release: () => void;
}

export interface CanvasSetup<Canvas extends EventTarget> {
  readonly surface: LiveSurface;
  readonly scheduler: FrameScheduler;
  readonly open: (canvas: Canvas) => CanvasGraphics;
  readonly place: (renderer: LiveRenderer) => void;
  readonly watchLayout: (onMoved: () => void) => () => void;
  readonly onRestored: () => void;
}

type LoopSetup = Pick<CanvasSetup<EventTarget>, 'surface' | 'scheduler' | 'place' | 'watchLayout'>;

export interface RunningCanvas {
  readonly invalidate: () => void;
  readonly dispose: () => void;
}

function sizeTo(renderer: LiveRenderer): void {
  renderer.resize(window.innerWidth, window.innerHeight, window.devicePixelRatio);
}

function runLoop(setup: LoopSetup, renderer: LiveRenderer): FrameLoop {
  const { surface, scheduler, place } = setup;
  const step = (nowMs: number): boolean => {
    place(renderer);
    const { moving, drawn } = renderer.draw(nowMs);
    surface.frameDrawn(drawn);
    return moving;
  };
  return createFrameLoop({ scheduler, step, onFrameTime: renderer.recordFrame });
}

export function syncCanvasViews(
  renderer: LiveRenderer,
  loop: FrameLoop,
  views: readonly LiveViewModel[],
): void {
  syncLive(renderer, views);
  loop.setActive(true);
  loop.invalidate();
}

function runGraphics(setup: LoopSetup, graphics: CanvasGraphics): RunningCanvas {
  const { surface } = setup;
  const { renderer, release } = graphics;
  sizeTo(renderer);
  const loop = runLoop(setup, renderer);
  const sync = (): void => {
    syncCanvasViews(renderer, loop, surface.live());
  };
  const resize = (): void => {
    sizeTo(renderer);
    loop.invalidate();
  };
  const unsubscribe = surface.subscribe(sync);
  const unwatch = setup.watchLayout(loop.invalidate);
  window.addEventListener('resize', resize);
  document.addEventListener('scroll', loop.invalidate, { capture: true, passive: true });
  sync();
  return {
    invalidate: loop.invalidate,
    dispose: (): void => {
      unsubscribe();
      unwatch();
      window.removeEventListener('resize', resize);
      document.removeEventListener('scroll', loop.invalidate, { capture: true });
      loop.dispose();
      renderer.dispose();
      release();
    },
  };
}

export function startCanvas<Canvas extends EventTarget>(
  canvas: Canvas,
  setup: CanvasSetup<Canvas>,
): RunningCanvas {
  const running = runGraphics(setup, setup.open(canvas));
  let halted = false;
  const halt = (): void => {
    if (halted) return;
    halted = true;
    running.dispose();
  };
  const lost = (event: Event): void => {
    event.preventDefault();
    log.warn('model.live_context_lost');
    halt();
    setup.surface.clearDrawn();
  };
  const restored = (): void => {
    log.info('model.live_context_restored');
    setup.onRestored();
  };
  canvas.addEventListener('webglcontextlost', lost);
  canvas.addEventListener('webglcontextrestored', restored);
  return {
    invalidate: (): void => {
      if (!halted) running.invalidate();
    },
    dispose: (): void => {
      canvas.removeEventListener('webglcontextlost', lost);
      canvas.removeEventListener('webglcontextrestored', restored);
      halt();
    },
  };
}
