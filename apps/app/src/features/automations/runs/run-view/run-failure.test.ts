import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { RunFailure } from './run-failure';

vi.mock('react-native', () => ({
  View: ({ children }: { readonly children?: ReactNode }): ReactNode =>
    createElement('div', null, children),
}));

vi.mock('../../../../components/text', () => ({
  Text: ({
    children,
    numberOfLines,
  }: {
    readonly children?: ReactNode;
    readonly numberOfLines?: number;
  }): ReactNode => createElement('span', { 'data-line-limit': numberOfLines }, children),
}));

describe('run failure details', () => {
  it('shows the full reason without a line limit', () => {
    const error = 'The command failed after reporting several status details. '.repeat(12);
    const markup = renderToStaticMarkup(createElement(RunFailure, { error }));
    expect(markup).toContain(`<span>Run error</span><span>${error}</span>`);
  });

  it('omits the error area when there is no error', () => {
    expect(renderToStaticMarkup(createElement(RunFailure, { error: null }))).toBe('');
  });
});
