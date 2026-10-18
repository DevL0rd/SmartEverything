import type { ControlModel } from '../overlay-render';
import { METER_WEIGHTS, RIBBON_WEIGHTS } from '../overlay-motion';
import { element, iconNode, textButton } from './overlay-nodes';

export const RIBBON_REST = 4 / 28;
export const THINKING_REST = 0.15;
const METER_FLOOR = 0.375;

function filled(className: string, count: number): HTMLElement {
  const node = element('div', className);
  for (let index = 0; index < count; index++) {
    node.append(element('i'));
  }
  return node;
}

export function buildRibbon(): HTMLElement {
  return filled('rib swap', RIBBON_WEIGHTS.length);
}

export function buildMeter(stoppable: boolean, label: string): HTMLElement {
  const meter = filled('mini', METER_WEIGHTS.length);
  if (!stoppable) {
    return meter;
  }
  const button = textButton('mb', label, '');
  button.dataset['act'] = 'interrupt';
  button.append(meter);
  return button;
}

export function paintRibbon(ribbon: HTMLElement, positions: readonly number[], rest: number): void {
  [...ribbon.children].forEach((bar, index) => {
    if (bar instanceof HTMLElement) {
      const position = positions[index] ?? 0;
      bar.style.setProperty(
        'transform',
        `scaleY(${Math.max(rest, (4 + 24 * position) / 28).toFixed(3)})`,
      );
    }
  });
}

export function paintMeter(meter: HTMLElement, step: number): void {
  const level = step / 5;
  [...meter.querySelectorAll('i')].forEach((bar, index) => {
    bar.style.setProperty(
      'transform',
      `scaleY(${Math.max(METER_FLOOR, (METER_WEIGHTS[index] ?? 0) * level).toFixed(3)})`,
    );
  });
}

function iconButton(model: ControlModel): HTMLButtonElement {
  const button = element('button', `b ${model.id} swap`);
  button.type = 'button';
  const face = element('span', model.critical ? 'bi crit' : 'bi');
  button.append(face);
  return button;
}

function chipButton(model: ControlModel): HTMLButtonElement {
  const button = element('button', 'chip swap');
  button.type = 'button';
  const label = element('span');
  label.textContent = model.label;
  button.append(iconNode('stopShare', 16), label);
  return button;
}

export function buildControl(model: ControlModel): HTMLButtonElement {
  const button =
    model.look === 'chip'
      ? chipButton(model)
      : model.look === 'text'
        ? textButton(`t ${model.id} swap`, model.label, model.label)
        : iconButton(model);
  button.dataset['act'] = model.id;
  return button;
}

function setFlag(button: HTMLElement, name: string, value: boolean | null): void {
  if (value === null) {
    button.removeAttribute(name);
  } else {
    button.setAttribute(name, String(value));
  }
}

function swapIcon(button: HTMLElement, model: ControlModel): void {
  const face = button.querySelector<HTMLElement>('.bi');
  if (face === null || model.icon === null || face.dataset['icon'] === model.icon) {
    return;
  }
  face.dataset['icon'] = model.icon;
  face.replaceChildren(iconNode(model.icon, 20));
  face.classList.toggle('crit', model.critical);
}

function syncDot(button: HTMLElement, show: boolean): void {
  const dot = button.querySelector('.ldot');
  if (show && dot === null) {
    button.append(element('i', 'ldot'));
  } else if (!show) {
    dot?.remove();
  }
}

export function updateControl(button: HTMLElement, model: ControlModel): void {
  button.setAttribute('aria-label', model.label);
  button.setAttribute('title', model.tip);
  setFlag(button, 'aria-pressed', model.pressed);
  setFlag(button, 'aria-expanded', model.expanded);
  if (model.look === 'icon') {
    swapIcon(button, model);
    syncDot(button, model.dot);
  }
}

export function syncChildren(parent: HTMLElement, desired: readonly Node[]): void {
  desired.forEach((node, index) => {
    const here = parent.children[index];
    if (here !== node) {
      parent.insertBefore(node, here ?? null);
    }
  });
  while (parent.children.length > desired.length) {
    parent.lastElementChild?.remove();
  }
}
