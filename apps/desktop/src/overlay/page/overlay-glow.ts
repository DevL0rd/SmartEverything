import { element } from './overlay-nodes';
import { GLOW_STILL_SCALE, type GlowModel } from '../overlay-render';
import type { MotionSink } from '../overlay-motion';

const NOTHING = (): void => undefined;

export class GlowDom {
  readonly #glow = element('div', 'glow');
  readonly #level = element('div', 'glow-lv');
  readonly #bloom = element('div', 'glow-bloom');
  readonly #rim = element('i', 'glow-rim');
  #reactive = false;
  #bloomed = false;
  #restKey = '';

  constructor(private readonly root: HTMLElement) {
    const quarter = element('div', 'glow-q');
    const mode = element('div', 'glow-mode');
    mode.append(element('i', 'blob b1'), element('i', 'blob b2'), element('i', 'blob b3'));
    quarter.append(mode);
    this.#level.append(quarter);
    this.#bloom.append(this.#level);
    this.#glow.append(this.#bloom, this.#rim);
    root.append(this.#glow);
  }

  render(model: GlowModel, reducedMotion: boolean, gpu: boolean): void {
    this.root.className = ['ov', reducedMotion ? 'rm' : '', gpu ? '' : 'nogpu']
      .filter((name) => name !== '')
      .join(' ');
    this.root.dataset['theme'] = model.theme;
    this.root.dataset['role'] = 'glow';
    const on = model.visible && model.mode !== 'off';
    this.root.removeAttribute('hidden');
    this.#glow.dataset['glow'] = model.mode;
    this.#glow.style.setProperty('--gon', on ? '1' : '0');
    this.#glow.classList.toggle('static', model.still);
    this.#reactive = !model.still && (model.mode === 'listening' || model.mode === 'speaking');
    this.#base(model);
    this.#bloomOn(model, on);
  }

  #bloomOn(model: GlowModel, on: boolean): void {
    if (model.bloom && !this.#bloomed && !model.still && on) {
      this.#play();
    }
    this.#bloomed = model.bloom;
  }

  sink(): MotionSink {
    return {
      ribbon: NOTHING,
      meter: NOTHING,
      orb: NOTHING,
      glow: (level): void => {
        if (this.#reactive) {
          this.#paint(0.4 + 0.6 * level, 0.35 + 0.55 * level, 0.35 + 0.65 * level);
        }
      },
      rest: (on): void => {
        this.root.toggleAttribute('data-rest', on);
      },
    };
  }

  #base(model: GlowModel): void {
    const key = `${model.mode}|${String(model.still)}`;
    if (key === this.#restKey) {
      return;
    }
    this.#restKey = key;
    const thinking = model.mode === 'thinking';
    const scale = model.still ? GLOW_STILL_SCALE : thinking ? 0.5 : 0.4;
    const opacity = model.still ? (thinking ? 0.35 : 0.45) : thinking ? 1 : 0.35;
    this.#paint(scale, opacity, 0.5);
  }

  #paint(scale: number, opacity: number, rim: number): void {
    this.#level.style.setProperty('transform', `scaleY(${scale.toFixed(3)})`);
    this.#level.style.setProperty('opacity', opacity.toFixed(3));
    this.#rim.style.setProperty('opacity', rim.toFixed(3));
  }

  #play(): void {
    this.#bloom.classList.remove('play');
    void this.#bloom.offsetWidth;
    this.#bloom.classList.add('play');
  }
}
