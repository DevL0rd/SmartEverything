import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { HealthPresence } from '../data/presence';
import type { DailyRows } from '../data/queries';
import { BrowseScreen } from './browse-screen';

interface Children {
  readonly children: ReactNode;
}

vi.mock('react-native', () => ({
  View: ({ className, children }: Children & { readonly className: string }): ReactNode =>
    createElement('div', { className }, children),
}));
vi.mock('../../../app-shell/hrefs', () => ({
  href: { logHealth: (): string => '/log' },
}));
vi.mock('../../../components/page-header', () => ({ PageHeader: (): null => null }));
vi.mock('../../../components/rows', () => ({
  NavRow: ({ title, href }: { readonly title: string; readonly href: string }): ReactNode =>
    createElement('a', { href }, title),
}));
vi.mock('../../../components/screen', () => ({
  Screen: ({ children, maxWidth }: Children & { readonly maxWidth: string }): ReactNode =>
    createElement('main', { 'data-width': maxWidth }, children),
}));
vi.mock('../../../components/section', () => ({
  List: ({ children }: Children): ReactNode => createElement('section', null, children),
}));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): null => null }));
vi.mock('../../../components/text', () => ({
  Text: ({ children }: Children): ReactNode => createElement('p', null, children),
}));
vi.mock('../components/more-to-allow', () => ({
  MoreToAllow: (): ReactNode => createElement('div', null, 'More you can add'),
}));
vi.mock('../data/day', () => ({ useToday: (): string => '2026-11-06' }));
vi.mock('../data/presence', () => ({
  useHealthPresence: (): HealthPresence => ({
    types: new Set(),
    domains: new Set(),
    loaded: true,
    error: null,
  }),
}));
vi.mock('../data/queries', () => ({
  PRESENCE_DAYS: 90,
  useDailyRows: (): DailyRows => ({ figures: [], complete: true, error: null }),
}));

describe('Fitness Browse footer', () => {
  it('keeps the log, permissions and guidance together with compact spacing in the full-width page', () => {
    const markup = renderToStaticMarkup(createElement(BrowseScreen));

    expect(markup).toContain('<main data-width="full">');
    expect(markup).toContain(
      '<div class="w-full max-w-reading gap-2"><section><a href="/log">Log health data</a></section><div>More you can add</div><p>Showing data from the last',
    );
  });
});
