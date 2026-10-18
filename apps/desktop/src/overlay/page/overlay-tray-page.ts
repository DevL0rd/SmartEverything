import type { OverlayBridge, OverlayPageState } from '../overlay-messages';
import { withSystemMotion } from './overlay-environment';
import { trayKeyStep } from '../overlay-keys';
import { cardModel, trayModel } from '../overlay-render';
import { onChange } from './overlay-nodes';
import { CardDom, TrayDom } from './overlay-tray-dom';
import { SizeReporter, trayWindowSize } from '../overlay-width';

export class TrayPage {
  readonly #tray: TrayDom;
  readonly #card: CardDom;
  readonly #reporter: SizeReporter;
  #open = false;
  #cardShown = false;
  #focused = false;

  constructor(
    private readonly bridge: OverlayBridge,
    private readonly root: HTMLElement,
  ) {
    this.#reporter = new SizeReporter((size) => {
      bridge.size(size);
    });
    const ports = {
      act: (action: Parameters<OverlayBridge['act']>[0]): void => {
        bridge.act(action);
      },
      hold: onChange((active) => {
        bridge.hold(active);
      }),
    };
    this.#tray = new TrayDom(ports);
    this.#card = new CardDom(ports);
    root.append(this.#tray.tray, this.#card.card);
    window.addEventListener('focus', () => {
      this.#focused = true;
      this.#focusInside();
    });
    window.addEventListener('blur', () => {
      if ((this.#open || this.#cardShown) && this.#focused) {
        this.#focused = false;
        bridge.tray(false);
      }
    });
    root.addEventListener('keydown', (event) => {
      this.#keyed(event);
    });
  }

  render(state: OverlayPageState): void {
    const view = withSystemMotion(state.view);
    const live = view.state !== 'hidden';
    const request = live ? cardModel(view) : null;
    const content = live ? trayModel(view, Date.now()) : null;
    const showCard = request !== null;
    const showTray = !showCard && state.trayOpen && content !== null;
    const opened = showTray && !this.#open;
    this.#open = showTray;
    this.#cardShown = showCard;
    this.root.toggleAttribute('hidden', !showCard && !showTray);
    this.#card.card.toggleAttribute('hidden', !showCard);
    this.#tray.tray.toggleAttribute('hidden', !showTray);
    this.root.setAttribute('class', this.#classes(view.mode, view.reducedMotion));
    this.root.dataset['theme'] = view.theme;
    this.root.dataset['role'] = 'tray';
    if (request !== null) {
      this.#card.render(request);
    }
    if (content !== null) {
      this.#tray.render(content);
    }
    this.#measure(showCard, showTray);
    if (opened) {
      requestAnimationFrame(() => {
        this.#tray.focusFirst();
      });
    }
  }

  #classes(mode: 'full' | 'share' | 'compact', reduced: boolean): string {
    return [
      'ov',
      mode === 'full' ? '' : 'bar',
      mode === 'compact' ? 'compact' : '',
      reduced ? 'rm' : '',
    ]
      .filter((name) => name !== '')
      .join(' ');
  }

  #measure(showCard: boolean, showTray: boolean): void {
    const visible = showCard ? this.#card.card : showTray ? this.#tray.tray : null;
    if (visible !== null) {
      this.#reporter.want(trayWindowSize(visible.getBoundingClientRect().height), false);
    }
  }

  #focusInside(): void {
    if (this.#open) {
      this.#tray.focusFirst();
    } else if (this.#cardShown) {
      this.#card.focusAccept();
    }
  }

  #keyed(event: KeyboardEvent): void {
    if (this.#cardShown && event.key === 'Escape') {
      event.preventDefault();
      this.bridge.act({ kind: 'decline_request' });
      return;
    }
    if (!this.#open) {
      return;
    }
    const controls = this.#tray.controls();
    const active = controls.findIndex((control) => control === document.activeElement);
    const step = trayKeyStep(event.key, event.shiftKey, controls.length, active);
    if (step.kind === 'close') {
      event.preventDefault();
      this.bridge.tray(false);
    } else if (step.kind === 'focus') {
      event.preventDefault();
      controls[step.index]?.focus();
    }
  }
}
