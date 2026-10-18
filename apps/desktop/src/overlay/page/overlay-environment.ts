import type { OverlayHostView } from '@smarteverything/domain/voice-overlay';
import type { MotionPorts } from '../overlay-motion';

export function browserMotionPorts(): MotionPorts {
  return {
    after: (ms, run) => {
      const handle = setTimeout(run, ms);
      return (): void => {
        clearTimeout(handle);
      };
    },
  };
}

export function withSystemMotion(view: OverlayHostView): OverlayHostView {
  const system = matchMedia('(prefers-reduced-motion: reduce)').matches;
  return system && !view.reducedMotion ? { ...view, reducedMotion: true } : view;
}
