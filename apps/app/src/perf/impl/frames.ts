import { AppState } from 'react-native';

export interface FrameHandlers {
  readonly frame: (gap: number, start: number, end: number) => void;
}

export function startFrames(handlers: FrameHandlers): () => void {
  let last = 0;
  let handle = 0;
  let stopped = false;
  const tick = (): void => {
    const now = performance.now();
    if (last > 0) {
      handlers.frame(now - last, last, now);
    }
    last = now;
    if (!stopped) {
      handle = requestAnimationFrame(tick);
    }
  };
  const state = AppState.addEventListener('change', () => {
    last = 0;
  });
  handle = requestAnimationFrame(tick);
  return (): void => {
    stopped = true;
    cancelAnimationFrame(handle);
    state.remove();
  };
}
