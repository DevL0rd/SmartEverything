import { act, createElement, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const screen = vi.hoisted((): { visible: boolean } => ({ visible: true }));

vi.mock('../design/visibility', () => ({
  useOnScreen: (): { visible: boolean; onLayout: undefined } => ({
    visible: screen.visible,
    onLayout: undefined,
  }),
}));

vi.mock(import('../design/motion'), async (importOriginal) => ({
  ...(await importOriginal()),
  useMotion: (): { reduced: boolean } => ({ reduced: false }),
}));

vi.mock('./text', () => ({ Text: (): ReactNode => null }));

vi.mock('react-native', async (importOriginal) => ({
  ...(await importOriginal<Record<string, unknown>>()),
  View: (): ReactNode => null,
}));

const { Figure } = await import('./figure');

let scheduled = 0;

function render(value: string): void {
  const root = createRoot({
    nodeType: 1,
    tagName: 'DIV',
    ownerDocument: null,
    addEventListener: (): void => undefined,
  });
  act(() => {
    root.render(createElement(Figure, { value }));
  });
  act(() => {
    root.render(createElement(Figure, { value: '30' }));
  });
}

describe('Figure count-up', () => {
  beforeEach(() => {
    scheduled = 0;
    vi.stubGlobal('requestAnimationFrame', (): number => {
      scheduled += 1;
      return scheduled;
    });
    vi.stubGlobal('cancelAnimationFrame', (): void => undefined);
    vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
    vi.stubGlobal('window', {
      event: undefined,
      document: { activeElement: null, body: null },
      HTMLIFrameElement: Date,
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('counts up a changed value that is on screen', () => {
    screen.visible = true;
    render('20');
    expect(scheduled).toBeGreaterThan(0);
  });

  it('shows a changed value that is off screen without scheduling any frame', () => {
    screen.visible = false;
    render('20');
    expect(scheduled).toBe(0);
  });
});
