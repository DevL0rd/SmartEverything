import { act, type ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

class FakeNode {
  readonly childNodes: FakeNode[] = [];
  readonly style = {
    setProperty: (): void => undefined,
    removeProperty: (): void => undefined,
  };
  readonly listeners: string[] = [];
  textContent = '';
  readonly namespaceURI = 'http://www.w3.org/1999/xhtml';

  constructor(
    readonly ownerDocument: FakeDocument | null,
    readonly tagName = 'DIV',
    readonly nodeType = 1,
  ) {}

  get nodeName(): string {
    return this.tagName;
  }

  appendChild(child: FakeNode): FakeNode {
    this.childNodes.push(child);
    return child;
  }

  insertBefore(child: FakeNode, before: FakeNode): FakeNode {
    this.childNodes.splice(this.childNodes.indexOf(before), 0, child);
    return child;
  }

  removeChild(child: FakeNode): FakeNode {
    this.childNodes.splice(this.childNodes.indexOf(child), 1);
    return child;
  }

  readonly setAttribute = (): void => undefined;
  readonly removeAttribute = (): void => undefined;

  getAttribute(): null {
    return null;
  }

  hasAttribute(): boolean {
    return false;
  }

  addEventListener(type: string): void {
    this.listeners.push(type);
  }

  readonly removeEventListener = (): void => undefined;

  contains(): boolean {
    return false;
  }

  readonly focus = (): void => undefined;
}

class FakeDocument extends FakeNode {
  readonly body: FakeNode;
  readonly documentElement: FakeNode;
  readonly activeElement = null;

  constructor() {
    super(null, '#document', 9);
    this.body = new FakeNode(this, 'BODY');
    this.documentElement = new FakeNode(this, 'HTML');
  }

  createElement(tag: string): FakeNode {
    return new FakeNode(this, tag.toUpperCase());
  }

  getElementById(): null {
    return null;
  }

  createTextNode(text: string): FakeNode {
    const node = new FakeNode(this, '#text', 3);
    node.textContent = text;
    return node;
  }
}

vi.mock('react-native-gesture-handler', () => ({
  GestureHandlerRootView: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('./toasts', () => ({ ToastLayer: (): null => null }));

let doc: FakeDocument;

beforeEach(() => {
  vi.resetModules();
  doc = new FakeDocument();
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  vi.stubGlobal('document', doc);
  vi.stubGlobal('ShadowRoot', Date);
  vi.stubGlobal('Node', FakeNode);
  vi.stubGlobal('window', {
    document: doc,
    event: undefined,
    HTMLIFrameElement: Date,
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    screen: { width: 1280, height: 800 },
    location: { href: 'http://localhost/' },
    addEventListener: (): void => undefined,
    removeEventListener: (): void => undefined,
  });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

async function mount(): Promise<(visible: boolean) => void> {
  const { createRoot } = await import('react-dom/client');
  const { ToastModal } = await import('./toast-modal');
  const container = doc.createElement('div');
  const root = createRoot(container);
  return (visible) => {
    act(() => {
      root.render(
        <ToastModal transparent animationType="none" visible={visible}>
          {null}
        </ToastModal>,
      );
    });
  };
}

describe('closed modals', () => {
  it('add no portal to the page body while hidden', async () => {
    const render = await mount();
    render(false);
    expect(doc.body.childNodes).toHaveLength(0);
  });

  it('remove their portal from the page body once dismissed', async () => {
    const render = await mount();
    render(true);
    expect(doc.body.childNodes).toHaveLength(1);
    render(false);
    expect(doc.body.childNodes).toHaveLength(0);
    render(true);
    expect(doc.body.childNodes).toHaveLength(1);
  });
});
