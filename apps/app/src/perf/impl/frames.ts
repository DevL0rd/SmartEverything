import { AppState } from 'react-native';
import { rawTimers } from '../../dev/raw-timers';

const FRAME_MS = 16.7;
const SAMPLE_MS = 250;

export interface FrameHandlers {
  readonly frame: (gap: number, start: number, end: number) => void;
}

export function startFrames(handlers: FrameHandlers): () => void {
  let expected = performance.now() + SAMPLE_MS;
  const timer = rawTimers.setInterval(() => {
    const now = performance.now();
    handlers.frame(FRAME_MS + Math.max(0, now - expected), expected - SAMPLE_MS, now);
    expected = now + SAMPLE_MS;
  }, SAMPLE_MS);
  const state = AppState.addEventListener('change', () => {
    expected = performance.now() + SAMPLE_MS;
  });
  return (): void => {
    rawTimers.clearInterval(timer);
    state.remove();
  };
}
