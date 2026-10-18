import type { OverlayBridge, OverlayPageState } from '../overlay-messages';
import { browserMotionPorts, withSystemMotion } from './overlay-environment';
import { Motion, motionPlan, type MotionPlan } from '../overlay-motion';
import { PillDom } from './overlay-pill-dom';
import { pillModel, restMs } from '../overlay-render';
import { onChange } from './overlay-nodes';
import { pillWindowSize, SizeReporter } from '../overlay-width';

function samePlan(a: MotionPlan | null, b: MotionPlan): boolean {
  return (
    a !== null &&
    a.source === b.source &&
    a.calm === b.calm &&
    a.gain === b.gain &&
    a.restMs === b.restMs
  );
}

export class PillPage {
  readonly #dom: PillDom;
  readonly #motion: Motion;
  readonly #reporter: SizeReporter;
  #open = false;
  #plan: MotionPlan | null = null;
  #shown = false;
  #width = 0;
  #leaving = 0;

  constructor(
    private readonly bridge: OverlayBridge,
    private readonly root: HTMLElement,
  ) {
    this.#reporter = new SizeReporter((size) => {
      bridge.size(size);
    });
    this.#dom = new PillDom(root, {
      act: (action): void => {
        bridge.act(action);
      },
      toggleTray: (): void => {
        bridge.tray(!this.#open);
      },
      hold: onChange((active) => {
        bridge.hold(active);
      }),
    });
    this.#motion = new Motion(browserMotionPorts(), this.#dom.sink());
    this.#dom.pill.addEventListener('transitionend', (event) => {
      if (event.propertyName === 'width') {
        this.#reporter.settled();
      }
    });
    bridge.onLevels((levels) => {
      this.#motion.level(levels);
    });
  }

  render(state: OverlayPageState): void {
    this.#open = state.trayOpen;
    const view = withSystemMotion(state.view);
    if (view.state === 'hidden' || !view.prefs.enabled) {
      this.#leave();
      return;
    }
    this.#leaving++;
    this.root.toggleAttribute('hidden', false);
    const model = pillModel(view, state.trayOpen);
    const result = this.#dom.render(model, state.gpu);
    this.#reveal();
    const animated = this.#width !== 0 && this.#width !== result.width && !model.reducedMotion;
    this.#width = result.width;
    this.#reporter.want(pillWindowSize(result.width, model.mode), animated);
    const next = motionPlan(view, restMs(view.state));
    if (!samePlan(this.#plan, next)) {
      this.#plan = next;
      this.#motion.plan(next);
    }
  }

  #reveal(): void {
    if (this.#shown) {
      this.#dom.pill.classList.remove('out');
      return;
    }
    this.#dom.replay();
    this.#shown = true;
  }

  #leave(): void {
    if (!this.#shown) {
      this.bridge.exited();
      return;
    }
    const ticket = ++this.#leaving;
    const { pill } = this.#dom;
    pill.classList.remove('in');
    pill.classList.add('out');
    const finish = (event: AnimationEvent): void => {
      if (event.target !== pill) {
        return;
      }
      pill.removeEventListener('animationend', finish);
      if (ticket === this.#leaving) {
        this.#hide();
      }
    };
    pill.addEventListener('animationend', finish);
  }

  #hide(): void {
    this.root.toggleAttribute('hidden', true);
    this.#shown = false;
    this.#plan = null;
    this.#width = 0;
    this.#reporter.reset();
    this.#motion.stop();
    this.bridge.exited();
  }
}
