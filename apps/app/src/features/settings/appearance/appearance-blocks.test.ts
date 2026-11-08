import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GridGap, GridLayout } from '../../../components/grid-layout';

const fixture = vi.hoisted(() => ({ width: 380 }));

vi.mock('react-native', () => ({
  View: ({
    children,
    className,
  }: {
    readonly children: ReactNode;
    readonly className: string;
  }): ReactNode => createElement('div', { className }, children),
}));

vi.mock('../../../components/use-measured-width', () => ({
  useMeasuredWidth: (): { readonly width: number; readonly onLayout: () => void } => ({
    width: fixture.width,
    onLayout: vi.fn(),
  }),
}));

vi.mock('../../../components/grid', async () => {
  const { gridLayoutOf } = await import('../../../components/grid-layout');
  return {
    useGridLayout: (
      width: number,
      minItemWidth: number,
      gap: GridGap,
      maxColumns: number,
    ): GridLayout =>
      gridLayoutOf({
        width,
        minItemWidth,
        gap,
        maxColumns,
        idiom: 'pointer',
        density: 'comfortable',
      }),
  };
});

const { AppearanceBlocks } = await import('./appearance-blocks');

function block(id: string, label: string): ReactNode {
  return createElement('span', { key: `appearance.${id}` }, label);
}

function render(reset = false): string {
  return renderToStaticMarkup(
    createElement(
      AppearanceBlocks,
      null,
      reset ? block('invalid', 'Reset') : null,
      block('preview', 'Preview'),
      block('theme', 'Colour'),
      block('surface', 'Shape'),
      block('motion', 'Motion'),
    ),
  );
}

describe('Appearance columns', () => {
  it('keeps the reset warning above the columns and motion after shape in the same column', () => {
    const html = render(true);
    expect(html).toContain('<span>Reset</span></div><div');
    expect(html).toContain('<span>Preview</span></div><div');
    expect(html).toContain('<span>Shape</span><span>Motion</span></div>');
    expect(html.match(/<span>[^<]+<\/span>/gu)).toHaveLength(5);
  });

  it.each([
    [380, 0, false],
    [812, 1, false],
    [1120, 2, true],
  ] as const)('keeps preference order at a %ipx pane width', (width, rows, spread) => {
    fixture.width = width;
    const html = render();
    expect(html.match(/<span>[^<]+<\/span>/gu)).toEqual([
      '<span>Preview</span>',
      '<span>Colour</span>',
      '<span>Shape</span>',
      '<span>Motion</span>',
    ]);
    expect(html.split('flex-row')).toHaveLength(rows + 1);
    expect(html.includes('flex-2')).toBe(spread);
  });
});
