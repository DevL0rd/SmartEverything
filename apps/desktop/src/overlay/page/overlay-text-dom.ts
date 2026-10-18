import type { TextModel } from '../overlay-render';
import { element } from './overlay-nodes';
import { DOT_WIDTH, type WidthInputs } from '../overlay-width';

const FONT_STATUS = '500 12px Geist-Medium, system-ui';
const FONT_HEADLINE = '500 15px Geist-Medium, system-ui';
const FONT_BAR = '500 13px Geist-Medium, system-ui';
const FONT_BAR_DETAIL = '13px Geist-Regular, system-ui';
const FONT_CAPTION = '15px Geist-Regular, system-ui';
const FONT_REASON = '12px Geist-Regular, system-ui';
const LETTER_SPACING = 0.2;

export type Measure = (text: string, font: string, spacing?: number) => number;

export function canvasMeasure(): Measure {
  const context = document.createElement('canvas').getContext('2d');
  return (text, font, spacing = 0) => {
    if (context === null) {
      throw new Error('the overlay needs a 2d canvas to measure text; received none');
    }
    context.font = font;
    return Math.ceil(context.measureText(text).width + spacing * text.length);
  };
}

function statusLine(model: TextModel): string {
  return model.detail === null ? model.status : `${model.status} · ${model.detail}`;
}

export function textWidths(
  model: TextModel,
  bar: boolean,
  measure: Measure,
): Pick<WidthInputs, 'statusWidth' | 'captionWidth'> {
  const caption =
    model.caption === null ? 0 : measure(model.caption, model.error ? FONT_REASON : FONT_CAPTION);
  if (bar) {
    const detail = model.detail === null ? 0 : measure(` · ${model.detail}`, FONT_BAR_DETAIL);
    return { statusWidth: measure(model.status, FONT_BAR) + detail, captionWidth: caption };
  }
  const line = statusLine(model);
  const statusWidth =
    model.single || model.error
      ? DOT_WIDTH + measure(line, FONT_HEADLINE)
      : DOT_WIDTH + measure(line, FONT_STATUS, LETTER_SPACING);
  return { statusWidth, captionWidth: caption };
}

function innerOf(model: TextModel, animate: boolean): HTMLElement {
  const inner = element('div', 'txt-in');
  inner.classList.toggle('swap', animate);
  inner.classList.toggle('single', model.single);
  inner.classList.toggle('err', model.error);
  const status = element('div', 'st');
  status.append(document.createTextNode(model.status));
  if (model.detail !== null) {
    const detail = element('span', 'st2');
    detail.textContent = ` · ${model.detail}`;
    status.append(detail);
  }
  inner.append(status);
  if (model.caption !== null) {
    const caption = element('div', 'cap');
    caption.append(element('span'));
    inner.append(caption);
  }
  return inner;
}

export class TextColumn {
  readonly node = element('div', 'txt');
  readonly #announce = element('div', 'sr');
  #key: string | null = null;

  constructor() {
    this.#announce.setAttribute('role', 'status');
    this.#announce.setAttribute('aria-live', 'polite');
    this.node.append(this.#announce);
  }

  update(model: TextModel, bar: boolean, animate: boolean): void {
    this.node.title = bar ? statusLine(model) : '';
    if (this.#key !== model.key) {
      this.#swap(model, animate && this.#key !== null);
      this.#key = model.key;
      this.#announce.textContent = statusLine(model);
    }
    const span = this.node.querySelector<HTMLElement>('.txt-in:not(.out) .cap span');
    if (span !== null && model.caption !== null && span.textContent !== model.caption) {
      span.textContent = model.caption;
    }
  }

  flags(over: boolean, clip: boolean): void {
    const current = this.node.querySelector('.txt-in:not(.out)');
    current?.querySelector('.cap')?.classList.toggle('over', over);
    current?.querySelector('.st')?.classList.toggle('clip', clip);
  }

  #swap(model: TextModel, animate: boolean): void {
    const previous = this.node.querySelector<HTMLElement>('.txt-in:not(.out)');
    const next = innerOf(model, animate);
    if (previous !== null && animate) {
      previous.className = 'txt-in out';
      previous.setAttribute('aria-hidden', 'true');
      previous.addEventListener(
        'animationend',
        () => {
          previous.remove();
        },
        { once: true },
      );
    } else {
      previous?.remove();
    }
    this.node.append(next);
  }
}
