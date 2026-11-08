import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { StatList } from './stat-list';

vi.mock('react-native', () => ({
  View: ({
    children,
    className,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
  }): ReactNode => createElement('div', { className }, children),
}));
vi.mock('../../../design/size-class', () => ({
  useSizeClass: (): { readonly split: boolean } => ({ split: false }),
}));
vi.mock('../../../components/text', () => ({
  Text: ({
    children,
    numberOfLines,
  }: {
    readonly children: ReactNode;
    readonly numberOfLines?: number;
  }): ReactNode => createElement('span', { 'data-line-limit': numberOfLines }, children),
}));

describe('Fitness stats', () => {
  it('lets short stats fit together and allows long text to wrap', () => {
    const label = 'Compared with the preceding week of measurements';
    const value = '12,345,678,901 steps recorded in the previous period';
    const note = 'Compared with the same seven-day range';
    const html = renderToStaticMarkup(
      createElement(StatList, {
        stats: [
          { label: 'Best day', value: '8,204 steps' },
          { label, value, note },
        ],
      }),
    );
    expect(html).toContain('flex-row flex-wrap');
    expect(html).toContain('max-w-full gap-0.5');
    expect(html).not.toContain('min-w-32');
    expect(html).not.toContain('data-line-limit');
    expect(html).toContain(label);
    expect(html).toContain(value);
    expect(html).toContain(note);
  });
});
