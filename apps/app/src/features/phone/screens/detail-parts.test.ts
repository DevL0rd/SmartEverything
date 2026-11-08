import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PageCards } from './detail-parts';

const fixture = vi.hoisted(() => ({ width: 380 }));

vi.mock('react-native', () => ({
  View: ({
    children,
    className,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
  }): ReactNode => createElement('div', { className }, children),
}));
vi.mock('../../../components/reason-line', () => ({ ReasonLine: (): null => null }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): null => null }));
vi.mock('../../../components/section-body', () => ({
  useFrameBodyWidth: (): number => fixture.width,
}));
vi.mock('../../../design/platform', () => ({ useIdiom: (): 'pointer' => 'pointer' }));
vi.mock('../../../design/theme', () => ({ useThemeSetting: (): 'comfortable' => 'comfortable' }));
vi.mock('../../../store/selectors', () => ({ useRow: (): null => null }));

describe('Phone detail cards', () => {
  it.each([
    [380, 5],
    [836, 3],
    [2796, 1],
  ])('packs five cards at pane width %s into %s rows', (width, rows) => {
    fixture.width = width;
    const items = ['Connection', 'Signal', 'Mobile', 'Data use', 'Bluetooth'].map((key) => ({
      key,
      node: key,
    }));
    const page = renderToStaticMarkup(createElement(PageCards, { cards: [null, ...items] }));
    expect(page.match(/class="flex-row items-stretch gap-grid-gap"/gu)).toHaveLength(rows);
    expect(page.match(/max-w-reading/gu)).toHaveLength(items.length);
    for (const { key } of items) expect(page).toContain(key);
  });
});
