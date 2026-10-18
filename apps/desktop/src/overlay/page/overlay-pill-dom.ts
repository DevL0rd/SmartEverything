import type { OverlayAction } from '@smarteverything/domain/voice-overlay';
import type { MotionSink } from '../overlay-motion';
import {
  buildControl,
  buildMeter,
  buildRibbon,
  paintMeter,
  paintRibbon,
  RIBBON_REST,
  syncChildren,
  THINKING_REST,
  updateControl,
} from './overlay-controls-dom';
import { element } from './overlay-nodes';
import { buildOrb, type OrbNodes } from './overlay-orb-dom';
import { type ControlId, type PillModel } from '../overlay-render';
import { canvasMeasure, TextColumn, textWidths, type Measure } from './overlay-text-dom';
import { pillWidth, type WidthResult } from '../overlay-width';

const STOP_LABEL = 'Stop the assistant talking';
const ACTIONS: Readonly<Record<ControlId, OverlayAction | null>> = {
  mute: { kind: 'mute' },
  speaker: { kind: 'speaker' },
  camera: { kind: 'camera' },
  share: { kind: 'share_screen' },
  more: null,
  stop_share: { kind: 'stop_share' },
  end: { kind: 'end' },
  retry: { kind: 'retry' },
  fix: { kind: 'fix' },
  close: { kind: 'close' },
};

export interface PillPorts {
  act(action: OverlayAction): void;
  toggleTray(): void;
  hold(active: boolean): void;
}

function isControl(value: string | undefined): value is ControlId {
  return value !== undefined && value in ACTIONS;
}

export class PillDom {
  readonly pill = element('div', 'pill');
  readonly #orb: OrbNodes = buildOrb();
  readonly #text = new TextColumn();
  readonly #controls = new Map<ControlId, HTMLButtonElement>();
  readonly #edge = element('i', 'edge');
  readonly #measure: Measure = canvasMeasure();
  #meter: HTMLElement | null = null;
  #meterKey = '';
  #ribbon: HTMLElement | null = null;
  #model: PillModel | null = null;
  #positions: readonly number[] = [];
  #step = 0;

  constructor(
    readonly root: HTMLElement,
    private readonly ports: PillPorts,
  ) {
    this.pill.setAttribute('role', 'group');
    this.pill.setAttribute('aria-label', 'Voice call');
    root.append(this.pill);
    root.addEventListener('click', (event) => {
      this.#clicked(event);
    });
    root.addEventListener('keydown', (event) => {
      this.#keyed(event);
    });
    this.pill.addEventListener('pointerover', () => {
      this.ports.hold(true);
    });
    this.pill.addEventListener('pointerleave', () => {
      this.ports.hold(false);
    });
  }

  get model(): PillModel | null {
    return this.#model;
  }

  render(model: PillModel, gpu: boolean): WidthResult {
    const previous = this.#model;
    this.#model = model;
    this.#applyRoot(model, gpu);
    this.#applyOrb(model);
    const nodes = this.#nodes(model);
    this.#text.update(model.text, model.mode !== 'full', !model.reducedMotion);
    syncChildren(this.pill, nodes);
    const result = this.#layout(model);
    this.pill.style.setProperty('--pw', `${String(result.width)}px`);
    this.#text.flags(result.overCaption, result.clipStatus);
    this.pill.classList.toggle('noctl', model.controls.length === 0);
    if (previous !== null && previous.mode !== model.mode) {
      this.replay();
    }
    return result;
  }

  replay(): void {
    this.pill.classList.remove('out', 'in');
    void this.pill.offsetWidth;
    this.pill.classList.add('in');
  }

  sink(): MotionSink {
    return {
      ribbon: (positions): void => {
        this.#positions = positions;
        if (this.#ribbon !== null) {
          paintRibbon(
            this.#ribbon,
            positions,
            this.#model?.state === 'thinking' ? THINKING_REST : RIBBON_REST,
          );
        }
      },
      meter: (step): void => {
        this.#step = step;
        if (this.#meter !== null) {
          paintMeter(this.#meter, step);
        }
      },
      orb: (scale, aura): void => {
        this.#orb.level.style.transform = `scale(${scale.toFixed(4)})`;
        this.#orb.aura.style.opacity = aura.opacity.toFixed(3);
        this.#orb.aura.style.transform = `scale(${aura.scale.toFixed(3)})`;
      },
      glow: (): void => undefined,
      rest: (on): void => {
        this.root.toggleAttribute('data-rest', on);
      },
    };
  }

  #applyRoot(model: PillModel, gpu: boolean): void {
    const bar = model.mode !== 'full';
    const classes = [
      'ov',
      'plat-desktop',
      `pos-${model.position}`,
      bar ? 'bar' : '',
      model.mode === 'share' ? 'share' : '',
      model.mode === 'compact' ? 'compact' : '',
      model.muted ? 'muted' : '',
      model.reducedMotion ? 'rm' : '',
      gpu ? '' : 'nogpu',
    ];
    this.root.className = classes.filter((name) => name !== '').join(' ');
    this.root.dataset['theme'] = model.theme;
    this.root.dataset['state'] = model.state;
    this.root.dataset['role'] = 'pill';
  }

  #applyOrb(model: PillModel): void {
    const { root } = this.#orb;
    root.dataset['orb'] = model.orb;
    root.classList.toggle('dim', model.dim);
    if (model.stopOrb) {
      root.setAttribute('role', 'button');
      root.tabIndex = 0;
      root.dataset['act'] = 'interrupt';
      root.setAttribute('aria-label', STOP_LABEL);
      root.title = STOP_LABEL;
    } else {
      ['role', 'tabindex', 'aria-label', 'title'].forEach((name) => {
        root.removeAttribute(name);
      });
      delete root.dataset['act'];
    }
  }

  #nodes(model: PillModel): Node[] {
    const seen = new Set<ControlId>();
    model.controls.forEach((control) => {
      seen.add(control.id);
      let button = this.#controls.get(control.id);
      if (button === undefined) {
        button = buildControl(control);
        this.#controls.set(control.id, button);
      }
      updateControl(button, control);
    });
    [...this.#controls.keys()].forEach((id) => {
      if (!seen.has(id)) {
        this.#controls.delete(id);
      }
    });
    this.#syncMeter(model);
    const before = model.mode !== 'full' && this.#meter !== null ? [this.#meter] : [];
    const after = model.mode === 'full' && this.#ribbon !== null ? [this.#ribbon] : [];
    const buttons = model.controls.flatMap((control) => this.#controls.get(control.id) ?? []);
    return [this.#edge, this.#orb.root, ...before, this.#text.node, ...after, ...buttons];
  }

  #syncMeter(model: PillModel): void {
    const key = `${model.meter ?? ''}|${String(model.meterStop)}`;
    if (key === this.#meterKey) {
      return;
    }
    this.#meterKey = key;
    this.#meter = model.meter === 'mini' ? buildMeter(model.meterStop, STOP_LABEL) : null;
    this.#ribbon = model.meter === 'ribbon' ? buildRibbon() : null;
    if (this.#meter !== null) {
      paintMeter(this.#meter, this.#step);
    }
    if (this.#ribbon !== null) {
      paintRibbon(this.#ribbon, this.#positions, RIBBON_REST);
    }
  }

  #layout(model: PillModel): WidthResult {
    const bar = model.mode !== 'full';
    const style = getComputedStyle(this.pill);
    const gap = Number.parseFloat(style.columnGap);
    let fixed = Number.parseFloat(style.paddingLeft) + Number.parseFloat(style.paddingRight);
    let count = 0;
    for (const child of this.pill.children) {
      if (
        child instanceof HTMLElement &&
        child !== this.#edge &&
        getComputedStyle(child).display !== 'none'
      ) {
        count++;
        if (child !== this.#text.node) {
          const margins = getComputedStyle(child);
          fixed +=
            child.offsetWidth +
            Number.parseFloat(margins.marginLeft) +
            Number.parseFloat(margins.marginRight);
        }
      }
    }
    fixed += (Number.isNaN(gap) ? 0 : gap) * Math.max(0, count - 1);
    const widths = textWidths(model.text, bar, this.#measure);
    return pillWidth({ mode: model.mode, fixed, ...widths });
  }

  #clicked(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const control = target.closest<HTMLElement>('[data-act]');
    if (control !== null) {
      this.#activate(control.dataset['act']);
      return;
    }
    if (target.closest('.pill') !== null) {
      this.ports.act({ kind: 'open' });
    }
  }

  #activate(name: string | undefined): void {
    if (name === 'interrupt') {
      this.ports.act({ kind: 'interrupt' });
    } else if (name === 'more') {
      this.ports.toggleTray();
    } else if (isControl(name)) {
      const action = ACTIONS[name];
      if (action !== null) {
        this.ports.act(action);
      }
    }
  }

  #keyed(event: KeyboardEvent): void {
    const target = event.target;
    if (
      (event.key === 'Enter' || event.key === ' ') &&
      target instanceof HTMLElement &&
      target.getAttribute('role') === 'button'
    ) {
      event.preventDefault();
      target.click();
    }
  }
}
