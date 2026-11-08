import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface ViewProps {
  readonly children?: ReactNode;
  readonly className?: string;
}

vi.mock('react-native', () => ({
  View: ({ children, className }: ViewProps): ReactNode =>
    createElement('div', { 'data-class': className ?? '' }, children),
}));

const { LayoutWide } = await import('./layout-wide');

describe('LayoutWide', () => {
  it('floats the Add panel over the canvas so the canvas keeps its whole area', () => {
    const markup = renderToStaticMarkup(
      createElement(LayoutWide, {
        top: null,
        sentence: null,
        banner: null,
        left: null,
        body: createElement('section', { id: 'canvas' }),
        float: createElement('aside', { id: 'palette' }),
        right: null,
      }),
    );
    expect(markup).toContain(
      '<div data-class="relative min-h-0 min-w-0 flex-1"><section id="canvas"></section><div data-class="absolute inset-y-0 right-0 max-w-full"><aside id="palette"></aside></div></div>',
    );
  });
});
