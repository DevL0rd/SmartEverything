import {
  VOICE_LEVEL_CHOICES,
  VOICE_THINKING_COPY,
} from '@smarteverything/domain/assistant-voice-copy';
import type { OverlayAction, OverlaySetup } from '@smarteverything/domain/voice-overlay';
import { element, iconNode } from './overlay-nodes';

const ARROW_STEPS: ReadonlyMap<string, number> = new Map([
  ['ArrowRight', 1],
  ['ArrowDown', 1],
  ['ArrowLeft', -1],
  ['ArrowUp', -1],
]);

type Level = (typeof VOICE_LEVEL_CHOICES)[number]['level'];

function levelOf(button: HTMLElement): Level | null {
  const level = button.dataset['level'];
  return VOICE_LEVEL_CHOICES.find((choice) => choice.level === level)?.level ?? null;
}

export class ThinkDom {
  readonly section = element('section', 'tr-think');
  readonly #saving = element('span', 'tk-save');
  readonly #group = element('div', 'tk-seg');
  readonly #note = element('div', 'tk-note');
  readonly #noteIcon = element('span', 'tk-alert');
  readonly #noteText = element('span');
  readonly #options = new Map<Level, HTMLButtonElement>();

  constructor(private readonly act: (action: OverlayAction) => void) {
    this.section.setAttribute('aria-label', VOICE_THINKING_COPY.section);
    const head = element('div', 'tk-head');
    const mark = element('span', 'tk-ic');
    mark.append(iconNode('brain', 18));
    const name = element('span', 'tk-name');
    name.textContent = VOICE_THINKING_COPY.section;
    this.#saving.textContent = VOICE_THINKING_COPY.saving;
    this.#saving.setAttribute('aria-live', 'polite');
    head.append(mark, name, this.#saving);
    this.#group.setAttribute('role', 'radiogroup');
    this.#group.setAttribute('aria-label', VOICE_THINKING_COPY.group);
    for (const choice of VOICE_LEVEL_CHOICES) {
      const option = element('button', 'tk-opt');
      option.type = 'button';
      option.setAttribute('role', 'radio');
      option.dataset['level'] = choice.level;
      option.textContent = choice.name;
      this.#options.set(choice.level, option);
      this.#group.append(option);
    }
    this.#noteIcon.append(iconNode('alert', 16));
    this.#note.setAttribute('aria-live', 'polite');
    this.#note.append(this.#noteIcon, this.#noteText);
    this.section.append(head, this.#group, this.#note);
    this.#group.addEventListener('click', (event) => {
      this.#clicked(event);
    });
    this.#group.addEventListener('keydown', (event) => {
      this.#keyed(event);
    });
  }

  render(setup: OverlaySetup): void {
    const loading = setup.state === 'loading';
    this.section.dataset['state'] = setup.state;
    this.#saving.toggleAttribute('hidden', setup.state !== 'saving');
    this.#noteIcon.toggleAttribute('hidden', setup.state !== 'failed');
    this.#noteText.textContent = setup.note;
    this.#group.toggleAttribute('aria-busy', loading);
    for (const [level, option] of this.#options) {
      const checked = level === setup.level;
      option.setAttribute('aria-checked', String(checked));
      option.tabIndex = checked ? 0 : -1;
      option.toggleAttribute('disabled', loading);
    }
  }

  #clicked(event: Event): void {
    const target = event.target;
    const option = target instanceof Element ? target.closest<HTMLElement>('.tk-opt') : null;
    const level = option === null ? null : levelOf(option);
    if (level !== null) {
      this.act({ kind: 'voice_thinking', level });
    }
  }

  #keyed(event: KeyboardEvent): void {
    const step = ARROW_STEPS.get(event.key);
    const levels = VOICE_LEVEL_CHOICES.map((choice) => choice.level);
    const here = levels.findIndex((level) => this.#options.get(level) === document.activeElement);
    const next = levels[(here + (step ?? 0) + levels.length) % levels.length];
    if (step === undefined || here < 0 || next === undefined) {
      return;
    }
    event.preventDefault();
    this.#options.get(next)?.focus();
    this.act({ kind: 'voice_thinking', level: next });
  }
}
