import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({
  View: (props: { readonly className: string; readonly children: ReactNode }): ReactNode =>
    createElement('div', { className: props.className }, props.children),
  TextInput: (props: { readonly placeholderTextColorClassName: string }): ReactNode =>
    createElement('input', { 'data-placeholder-color': props.placeholderTextColorClassName }),
}));
vi.mock('../design/platform', () => ({ useIdiom: (): string => 'pointer' }));
vi.mock('./icon', () => ({ Icon: (): null => null }));
vi.mock('./icon-button', () => ({ IconButton: (): null => null }));
vi.mock('./text', () => ({
  Text: (props: { readonly children: ReactNode }): ReactNode =>
    createElement('span', null, props.children),
}));

const { SearchField } = await import('./search-field');

describe('SearchField focus', () => {
  it.each(['bar', 'field'] as const)(
    'outlines the %s when its web input has visible focus',
    (variant) => {
      const markup = renderToStaticMarkup(
        createElement(SearchField, {
          value: '',
          onChange: () => undefined,
          placeholder: 'Search',
          variant,
        }),
      );
      expect(markup).toContain(
        'web:input-focus-visible:outline-2 web:input-focus-visible:outline-focus web:input-focus-visible:-outline-offset-2',
      );
      expect(markup).toMatch(/><input [^>]*\/><\/div>$/);
    },
  );
});

it('uses the readable secondary text tone for the search placeholder', () => {
  const markup = renderToStaticMarkup(
    createElement(SearchField, { value: '', onChange: () => undefined, placeholder: 'Search' }),
  );
  expect(markup).toContain('data-placeholder-color="accent-on-surface-variant"');
});

describe('SearchField as an active filter', () => {
  const render = (value: string, active: boolean): string =>
    renderToStaticMarkup(
      createElement(SearchField, {
        value,
        onChange: () => undefined,
        placeholder: 'Type to filter this folder',
        variant: 'field',
        status: '3 of 48',
        active,
      }),
    );

  it('draws the primary outline only while active, keeping the inner padding', () => {
    expect(render('bud', true)).toContain('border-2 border-primary pl-2.5');
    expect(render('', false)).not.toContain('border-primary');
    expect(render('', false)).toContain('pl-3');
  });

  it('shows the match count beside the clear button only while text is typed', () => {
    expect(render('bud', true)).toContain('<span>3 of 48</span>');
    expect(render('', false)).not.toContain('3 of 48');
  });
});
