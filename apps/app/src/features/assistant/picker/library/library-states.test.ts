import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import { LibraryProblem } from './library-states';

interface BoxProps {
  readonly children?: ReactNode;
  readonly className?: string;
  readonly style?: { readonly height: number };
  readonly accessibilityLabel?: string;
  readonly accessibilityRole?: string;
  readonly 'aria-hidden'?: boolean;
  readonly 'aria-busy'?: boolean;
}

function Box({
  children,
  className,
  style,
  accessibilityLabel,
  accessibilityRole,
  'aria-hidden': hidden,
  'aria-busy': busy,
}: BoxProps): ReactNode {
  return createElement(
    'div',
    {
      className,
      style,
      role: accessibilityRole,
      'aria-label': accessibilityLabel,
      'aria-hidden': hidden,
      'aria-busy': busy,
    },
    children,
  );
}

vi.mock('react-native', () => ({ View: Box }));
vi.mock('../../../../components/button', () => ({
  Button: ({ label }: { readonly label: string }): ReactNode => createElement('button', {}, label),
}));
vi.mock('../../../../components/empty-state', () => ({ EmptyState: Box }));
vi.mock('../../../../components/icon', () => ({ Icon: Box }));
vi.mock('../../../../components/skeleton', () => ({
  Skeleton: (): ReactNode => createElement('i'),
}));
vi.mock('../../../../components/text', () => ({ Text: Box }));

const actions = { retry: (): void => undefined, reset: (): void => undefined };

it.each([
  [1, 88],
  [1, 72],
  [3, 72],
  [5, 72],
])('matches %i result lanes at a %i px row height', (columns, rowHeight) => {
  const markup = renderToStaticMarkup(
    createElement(LibraryProblem, {
      ...actions,
      view: 'loading',
      loadingLayout: { columns, rowHeight },
    }),
  );
  expect(markup).toContain('aria-busy="true"');
  expect(markup).toContain('aria-label="Loading models"');
  const rows = markup.split(`style="height:${String(rowHeight)}px"`).slice(1);
  expect(rows).toHaveLength(6);
  for (const row of rows) {
    expect(row).toContain('aria-hidden="true"');
    expect(row.match(/size-8/g)).toHaveLength(columns);
  }
});

it('keeps the compact loading fallback for callers without a result layout', () => {
  const markup = renderToStaticMarkup(
    createElement(LibraryProblem, { ...actions, view: 'loading', noun: 'image models' }),
  );
  expect(markup).toContain('aria-label="Loading image models"');
  expect(markup.match(/<i>/g)).toHaveLength(6);
});

it('exposes the retry alert instead of placeholders after a request fails', () => {
  const markup = renderToStaticMarkup(
    createElement(LibraryProblem, {
      ...actions,
      view: 'error',
      loadingLayout: { columns: 5, rowHeight: 72 },
    }),
  );
  expect(markup).toContain('role="alert"');
  expect(markup).toContain('Try again');
  expect(markup).not.toContain('aria-busy');
});
