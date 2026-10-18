import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

const texts = vi.hoisted(() => new Array<Record<string, unknown>>());

vi.mock('./icon', () => ({ Icon: (): null => null }));

vi.mock('./text', () => ({
  Text: (props: Record<string, unknown>): null => {
    texts.push(props);
    return null;
  },
}));

const { EmptyState } = await import('./empty-state');

describe('EmptyState', () => {
  it.each([false, true])('shows the whole body without a line clamp (compact %s)', (compact) => {
    texts.length = 0;
    renderToStaticMarkup(
      createElement(EmptyState, {
        icon: 'search',
        title: 'Nothing yet',
        body: 'Long body',
        compact,
      }),
    );
    const body = texts.find((props) => props['children'] === 'Long body');
    expect(body).toBeDefined();
    expect(body).not.toHaveProperty('numberOfLines');
  });
});
