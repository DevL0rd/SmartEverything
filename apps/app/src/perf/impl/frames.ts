import { AppState } from 'react-native';

export interface FrameHandlers {
  readonly frame: (gap: number, start: number, end: number) => void;
}

export function startFrames(handlers: FrameHandlers): () => void {
  let last = 0;
  let handle = 0;
  let stopped = false;
  const active = (): boolean => !stopped;
  const tick = (): void => {
    if (!active()) {
      return;
    }
    const now = performance.now();
    if (last > 0) {
      handlers.frame(now - last, last, now);
    }
    last = now;
    if (active()) {
      handle = requestAnimationFrame(tick);
    }
  };
  const state = AppState.addEventListener('change', () => {
    if (!stopped) {
      last = 0;
    }
  });
  const stop = (): void => {
    if (stopped) {
      return;
    }
    stopped = true;
    try {
      cancelAnimationFrame(handle);
    } finally {
      state.remove();
    }
  };
  try {
    handle = requestAnimationFrame(tick);
    return stop;
  } catch (error: unknown) {
    stop();
    throw error;
  }
}
