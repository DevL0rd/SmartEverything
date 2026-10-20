import type { OverlayAction } from '@smarteverything/domain/voice-overlay';
import { syncChildren } from './overlay-controls-dom';
import { element, iconNode, textButton } from './overlay-nodes';
import { ThinkDom } from './overlay-think-dom';
import {
  SYSTEM_SPEAKER_NOTE,
  type CardModel,
  type MicOption,
  type TileModel,
  type TrayModel,
} from '../overlay-render';

const TRAY_LABEL = 'More call controls';
const OPEN_CALL = 'Open call';
const MICROPHONE = 'Microphone';
const VOLUME = 'Voice volume';
const VOLUME_LABEL = 'Assistant voice volume';

export interface TrayPorts {
  act(action: OverlayAction): void;
  hold(active: boolean): void;
}

function tileButton(tile: TileModel): HTMLButtonElement {
  const button = element('button', 'tile');
  button.type = 'button';
  button.dataset['act'] = tile.id;
  button.append(element('span'));
  return button;
}

function patchTile(button: HTMLButtonElement, tile: TileModel): void {
  button.setAttribute('title', tile.tip);
  button.toggleAttribute('disabled', tile.disabled);
  button.classList.toggle('crit', tile.critical);
  if (tile.pressed === null) {
    button.removeAttribute('aria-pressed');
  } else {
    button.setAttribute('aria-pressed', String(tile.pressed));
  }
  if (button.getAttribute('data-icon') !== tile.icon) {
    button.setAttribute('data-icon', tile.icon);
    button.querySelector('svg')?.remove();
    button.prepend(iconNode(tile.icon, 20));
  }
  const label = button.querySelector('span');
  if (label !== null && label.textContent !== tile.label) {
    label.textContent = tile.label;
  }
}

function labelled(icon: 'mic' | 'vol', text: string): HTMLLabelElement {
  const row = element('label', 'tr-row');
  const mark = element('span', 'ri');
  mark.append(iconNode(icon, 18));
  const name = element('span', 'rl');
  name.textContent = text;
  row.append(mark, name);
  return row;
}

function micSelect(): { row: HTMLLabelElement; select: HTMLSelectElement } {
  const row = labelled('mic', MICROPHONE);
  const select = element('select');
  select.setAttribute('aria-label', MICROPHONE);
  row.append(select);
  return { row, select };
}

function volumeRange(): {
  row: HTMLLabelElement;
  input: HTMLInputElement;
  value: HTMLElement;
} {
  const row = labelled('vol', VOLUME);
  const input = element('input');
  input.type = 'range';
  input.min = '0';
  input.max = '100';
  input.setAttribute('aria-label', VOLUME_LABEL);
  const value = element('span', 'rv');
  row.append(input, value);
  return { row, input, value };
}

const TILE_ACTIONS = {
  camera: 'camera',
  pause_video: 'pause_video',
  show_this: 'show_this',
  share_screen: 'share_screen',
  stop_share: 'stop_share',
  share_window: 'share_window',
  home_camera: 'home_camera',
  interrupt: 'interrupt',
  speaker: 'speaker',
  captions: 'captions',
  settings: 'settings',
} as const satisfies Record<TileModel['id'], OverlayAction['kind']>;

export class TrayDom {
  readonly tray = element('div', 'tray');
  readonly #tiles = new Map<TileModel['id'], HTMLButtonElement>();
  readonly #grid = element('div', 'tiles');
  readonly #name = element('b');
  readonly #sub = element('span');
  readonly #mic = micSelect();
  readonly #volume = volumeRange();
  readonly #think: ThinkDom;
  #mics = '';

  constructor(private readonly ports: TrayPorts) {
    this.tray.setAttribute('role', 'group');
    this.tray.setAttribute('aria-label', TRAY_LABEL);
    this.#think = new ThinkDom((action) => {
      this.ports.act(action);
    });
    this.tray.append(this.#head(), this.#grid, this.#think.section, this.#rows());
    this.tray.addEventListener('click', (event) => {
      this.#clicked(event);
    });
    this.#mic.select.addEventListener('change', () => {
      const id = this.#mic.select.value;
      this.ports.act({ kind: 'mic', id: id === '' ? null : id });
    });
    this.#volume.input.addEventListener('input', () => {
      this.#volume.value.textContent = `${this.#volume.input.value}%`;
    });
    this.#volume.input.addEventListener('change', () => {
      this.ports.act({ kind: 'volume', value: Number(this.#volume.input.value) / 100 });
    });
    this.tray.addEventListener('pointerover', () => {
      this.ports.hold(true);
    });
    this.tray.addEventListener('pointerleave', () => {
      this.ports.hold(false);
    });
  }

  render(model: TrayModel): void {
    this.#name.textContent = model.assistant;
    this.#sub.textContent = model.subtitle;
    const wanted = model.tiles.map((tile) => {
      let button = this.#tiles.get(tile.id);
      if (button === undefined) {
        button = tileButton(tile);
        this.#tiles.set(tile.id, button);
      }
      patchTile(button, tile);
      return button;
    });
    syncChildren(this.#grid, wanted);
    this.#think.render(model.setup);
    this.#micOptions(model.mics, model.micId);
    if (document.activeElement !== this.#volume.input) {
      this.#volume.input.value = String(model.volume);
      this.#volume.value.textContent = `${String(model.volume)}%`;
    }
  }

  focusFirst(): void {
    this.tray.querySelector<HTMLElement>('button:not([disabled]),select,input')?.focus();
  }

  controls(): HTMLElement[] {
    return [
      ...this.tray.querySelectorAll<HTMLElement>('button:not([disabled]),select,input'),
    ].filter((control) => control.tabIndex >= 0);
  }

  #head(): HTMLElement {
    const head = element('div', 'tr-head');
    const identity = element('div', 'tr-id');
    identity.append(this.#name, this.#sub);
    const open = element('button', 'tr-open');
    open.type = 'button';
    open.dataset['act'] = 'open';
    const text = element('span');
    text.textContent = OPEN_CALL;
    open.append(iconNode('open', 16), text);
    head.append(identity, open);
    return head;
  }

  #rows(): HTMLElement {
    const rows = element('div', 'tr-rows');
    const note = element('div', 'tr-note');
    note.textContent = SYSTEM_SPEAKER_NOTE;
    rows.append(this.#mic.row, this.#volume.row, note);
    return rows;
  }

  #micOptions(mics: readonly MicOption[], selected: string): void {
    const key = mics.map((mic) => `${mic.id}\u0000${mic.label}`).join('\u0001');
    if (key !== this.#mics) {
      this.#mics = key;
      this.#mic.select.replaceChildren(
        ...mics.map((mic) => {
          const option = element('option');
          option.value = mic.id;
          option.textContent = mic.label;
          return option;
        }),
      );
    }
    if (this.#mic.select.value !== selected) {
      this.#mic.select.value = selected;
    }
  }

  #clicked(event: Event): void {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }
    const button = target.closest<HTMLElement>('[data-act]');
    if (button?.dataset['act'] === 'open') {
      this.ports.act({ kind: 'open' });
      return;
    }
    for (const [id, tile] of this.#tiles) {
      if (tile === button) {
        this.ports.act({ kind: TILE_ACTIONS[id] });
      }
    }
  }
}

export class CardDom {
  readonly card = element('div', 'card');
  readonly #title = element('b');
  readonly #why = element('span');
  readonly #accept = textButton('rq-yes', '', '');
  readonly #decline = textButton('rq-no', '', '');

  constructor(private readonly ports: TrayPorts) {
    this.card.setAttribute('role', 'region');
    const mark = element('div', 'rq-ic');
    mark.append(iconNode('eye', 22));
    const text = element('div', 'rq-tx');
    text.append(this.#title, this.#why);
    const actions = element('div', 'rq-act');
    actions.append(this.#accept, this.#decline);
    this.card.append(mark, text, actions);
    this.#accept.addEventListener('click', () => {
      this.ports.act({ kind: 'accept_request' });
    });
    this.#decline.addEventListener('click', () => {
      this.ports.act({ kind: 'decline_request' });
    });
    this.card.addEventListener('pointerover', () => {
      this.ports.hold(true);
    });
    this.card.addEventListener('pointerleave', () => {
      this.ports.hold(false);
    });
  }

  focusAccept(): void {
    this.#accept.focus();
  }

  render(model: CardModel): void {
    this.card.setAttribute('aria-label', model.title);
    this.#title.textContent = model.title;
    this.#why.textContent = model.why;
    this.#accept.textContent = model.accept;
    this.#accept.title = model.accept;
    this.#accept.setAttribute('aria-label', model.accept);
    this.#decline.textContent = model.decline;
    this.#decline.title = model.decline;
    this.#decline.setAttribute('aria-label', model.decline);
  }
}
