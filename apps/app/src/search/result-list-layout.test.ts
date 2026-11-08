import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ListRowProps } from '../components/list-row';
import { ResultList, type SearchListModel } from './result-list';
import type { SearchRow } from './result-rows';

interface ListProbe {
  readonly data: readonly SearchRow[];
  readonly renderItem: (row: { readonly item: SearchRow; readonly index: number }) => ReactNode;
}

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

function none(): null {
  return null;
}

vi.mock('react-native', () => ({ View: 'div' }));
vi.mock('react-native-reanimated', () => ({
  default: { createAnimatedComponent: <Component>(component: Component): Component => component },
}));
vi.mock('uniwind', () => ({ useResolveClassNames: (): null => null }));
vi.mock('@shopify/flash-list', () => ({
  FlashList: ({ data, renderItem }: ListProbe): ReactNode =>
    createElement(
      'div',
      { 'data-list': true },
      data.map((item, index) =>
        createElement(Fragment, { key: item.key }, renderItem({ item, index })),
      ),
    ),
}));
vi.mock('../components/interactive', () => ({ Interactive: none }));
vi.mock('../components/list-row', () => ({
  ListRow: ({ title, wrapTitle }: ListRowProps): ReactNode =>
    createElement('p', { 'data-wrap': wrapTitle }, title),
}));
vi.mock('../components/section', () => ({ Section: none, SectionAction: none }));
vi.mock('../components/text', () => ({ Text: none }));
vi.mock('./node-row', () => ({ NodeRow: none }));
vi.mock('./row-frame', () => ({ RowFrame: childrenOf }));

const MODEL: SearchListModel = {
  rows: [
    { kind: 'query', key: 'a', text: 'First result', icon: 'clock', depth: 0, edge: 'first' },
    { kind: 'query', key: 'b', text: 'Second result', icon: 'clock', depth: 0, edge: 'last' },
  ],
  query: '',
  catalogue: {
    index: { entries: [], numbers: [] },
    entries: new Map(),
    links: new Map(),
    icons: new Map(),
    devices: new Map(),
    parents: new Map(),
    children: new Map(),
    plugins: new Set(),
    controls: new Map(),
  },
  look: 'page',
  selectedKey: null,
  keyboard: false,
  navigating: false,
  picking: false,
  onOpen: vi.fn(),
  onToggle: vi.fn(),
  onShowAll: vi.fn(),
  onQuery: vi.fn(),
  onClearRecent: vi.fn(),
};

describe('Search result presentation', () => {
  it('applies the detail measure to each full-page result while keeping the list viewport fluid', () => {
    const page = renderToStaticMarkup(createElement(ResultList, { model: MODEL, fullPage: true }));
    expect(page).toContain('<div class="flex-1"><div data-list="true">');
    expect(page.match(/class="w-full max-w-detail"/gu)).toHaveLength(MODEL.rows.length);
    expect(page).toContain('<p data-wrap="true">First result</p>');
    expect(page.indexOf('First result')).toBeLessThan(page.indexOf('Second result'));
  });

  it('renders compact shared search rows without the standalone width and wrapping policy', () => {
    const page = renderToStaticMarkup(createElement(ResultList, { model: MODEL }));
    expect(page).toContain(
      '<div data-list="true"><p data-wrap="false">First result</p><p data-wrap="false">Second result</p>',
    );
  });
});
