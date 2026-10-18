import { glowModel, restMs } from '../overlay-render';
import { browserMotionPorts, withSystemMotion } from './overlay-environment';
import { GlowDom } from './overlay-glow';
import { Motion, motionPlan } from '../overlay-motion';
import type { OverlayBridge, OverlayPageState } from '../overlay-messages';

export function mountGlow(
  bridge: OverlayBridge,
  root: HTMLElement,
): (state: OverlayPageState) => void {
  const dom = new GlowDom(root);
  const motion = new Motion(browserMotionPorts(), dom.sink());
  let key = '';
  bridge.onLevels((levels) => {
    motion.level(levels);
  });
  return (state) => {
    const view = withSystemMotion(state.view);
    const model = glowModel(view, state.gpu);
    dom.render(model, view.reducedMotion, state.gpu);
    if (!model.visible || model.mode === 'off') {
      motion.stop();
      key = '';
      return;
    }
    const plan = motionPlan(view, restMs(view.state));
    const next = `${String(plan.source)}|${String(plan.calm)}|${String(plan.restMs)}|${model.mode}`;
    if (next !== key) {
      key = next;
      motion.plan(plan);
    }
  };
}
