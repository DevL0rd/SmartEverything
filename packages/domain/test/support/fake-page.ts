import { runInNewContext } from 'node:vm';
import { BROWSER_PAGE_SCRIPT } from '../../src/browser-page-script';

export interface FakeRect {
  readonly left: number;
  readonly top: number;
  readonly width: number;
  readonly height: number;
}

export interface FakeElementInit {
  readonly tagName: string;
  readonly type?: string;
  readonly attributes?: Readonly<Record<string, string>>;
  readonly value?: string;
  readonly text?: string;
  readonly rect?: FakeRect;
  readonly checked?: boolean;
  readonly disabled?: boolean;
  readonly editable?: boolean;
  readonly labels?: readonly string[];
  readonly display?: string;
}

const BOX: FakeRect = { left: 10, top: 20, width: 100, height: 40 };

const DEFAULTS = {
  attributes: {},
  value: '',
  text: '',
  rect: BOX,
  checked: false,
  disabled: false,
  editable: false,
  labels: [],
  display: 'block',
} as const;

export class FakeForm {
  submitted = 0;

  requestSubmit(): void {
    this.submitted += 1;
  }
}

export class FakeElement {
  readonly tagName: string;
  readonly type: string | undefined;
  readonly attributes: Readonly<Record<string, string>>;
  readonly innerText: string;
  readonly textContent: string;
  readonly labels: readonly { readonly textContent: string }[];
  readonly rect: FakeRect;
  readonly isContentEditable: boolean;
  display: string;
  form: FakeForm | null = null;
  checked: boolean;
  disabled: boolean;
  isConnected = true;
  clicks = 0;
  scrolled = 0;
  selected = false;
  events: string[] = [];
  private text: string;

  constructor(
    private readonly page: FakePage,
    init: FakeElementInit,
  ) {
    const resolved = { ...DEFAULTS, ...init };
    this.tagName = resolved.tagName.toUpperCase();
    this.type = resolved.type;
    this.attributes = resolved.attributes;
    this.text = resolved.value;
    this.innerText = resolved.text;
    this.textContent = resolved.text;
    this.labels = resolved.labels.map((textContent) => ({ textContent }));
    this.rect = resolved.rect;
    this.isContentEditable = resolved.editable;
    this.checked = resolved.checked;
    this.disabled = resolved.disabled;
    this.display = resolved.display;
  }

  get value(): string {
    return this.text;
  }

  set value(next: string) {
    this.text = next;
  }

  getAttribute(name: string): string | null {
    return this.attributes[name] ?? null;
  }

  getBoundingClientRect(): FakeRect {
    return this.rect;
  }

  scrollIntoView(): void {
    this.scrolled += 1;
  }

  focus(): void {
    this.page.active = this;
  }

  click(): void {
    this.clicks += 1;
  }

  select(): void {
    this.selected = true;
  }

  dispatchEvent(event: { readonly type: string }): boolean {
    this.events.push(event.type);
    return true;
  }
}

interface FakeDocument {
  title: string;
  body: { innerText: string };
  activeElement: FakeElement | null;
  querySelectorAll: () => FakeElement[];
  getElementById: (id: string) => FakeElement | null;
  createRange: () => { selectNodeContents: (element: FakeElement) => void };
}

class FakeEvent {
  constructor(readonly type: string) {}
}

export class FakePage {
  readonly elements: FakeElement[] = [];
  readonly scrolls: { left: number; top: number; behavior: string }[] = [];
  readonly ranges: FakeElement[] = [];
  active: FakeElement | null = null;
  title = 'Example page';
  bodyText = 'Hello  world';

  add(init: FakeElementInit): FakeElement {
    const element = new FakeElement(this, init);
    this.elements.push(element);
    return element;
  }

  private readonly document: FakeDocument = {
    title: '',
    body: { innerText: '' },
    activeElement: null,
    querySelectorAll: (): FakeElement[] => this.elements,
    getElementById: (id: string): FakeElement | null =>
      this.elements.find((element) => element.attributes['id'] === id) ?? null,
    createRange: () => ({
      selectNodeContents: (element: FakeElement): void => {
        this.ranges.push(element);
      },
    }),
  };

  private readonly window = {
    scrollX: 7,
    scrollY: 9,
    HTMLInputElement: FakeElement,
    HTMLTextAreaElement: FakeElement,
    Event: FakeEvent,
    KeyboardEvent: FakeEvent,
    getComputedStyle: (element: FakeElement): { visibility: string; display: string } => ({
      visibility: 'visible',
      display: element.display,
    }),
    getSelection: (): { removeAllRanges: () => void; addRange: () => void } => ({
      removeAllRanges: () => undefined,
      addRange: () => undefined,
    }),
    scrollBy: (options: { left: number; top: number; behavior: string }): void => {
      this.scrolls.push(options);
    },
  };

  run(operation: unknown, start = 1): unknown {
    return this.evaluate(`${BROWSER_PAGE_SCRIPT}(${JSON.stringify(operation)}, ${String(start)})`);
  }

  evaluate(code: string): unknown {
    this.document.title = this.title;
    this.document.body.innerText = this.bodyText;
    this.document.activeElement = this.active;
    return runInNewContext(code, { window: this.window, document: this.document });
  }
}
