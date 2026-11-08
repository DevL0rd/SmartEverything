import { cloneElement, createElement, type ReactElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { SectionAction } from './section';

vi.mock('../design/platform', () => ({
  isNative: (): boolean => false,
  useIdiom: (): 'pointer' => 'pointer',
}));

vi.mock('../design/colour', () => ({ useColour: (): string => 'currentColor' }));

vi.mock('expo-router', () => ({
  Link: ({
    children,
    href,
  }: {
    readonly children: ReactElement<{ readonly href?: string }>;
    readonly href: string;
  }): ReactElement => cloneElement(children, { href }),
}));

describe('SectionAction', () => {
  it('exposes an action without a destination as a focusable button', () => {
    const markup = renderToStaticMarkup(
      createElement(SectionAction, { label: 'Edit', onPress: vi.fn() }),
    );

    expect(markup).toContain('aria-label="Edit"');
    expect(markup).toContain('role="button"');
    expect(markup).toContain('tabindex="0"');
    expect(markup).not.toContain('href=');
  });

  it('preserves the accessible link and destination when given an href', () => {
    const markup = renderToStaticMarkup(
      createElement(SectionAction, { label: 'See all', href: '/devices' }),
    );

    expect(markup).toContain('aria-label="See all"');
    expect(markup).toContain('href="/devices"');
    expect(markup).toMatch(/<a\b/u);
    expect(markup).not.toContain('role="button"');
  });
});
