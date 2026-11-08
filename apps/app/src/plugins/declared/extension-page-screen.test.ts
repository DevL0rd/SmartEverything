import type { PluginUiRow } from '@smarteverything/domain';
import { createContext, createElement, useContext, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type * as GridModule from '../../components/grid';
import type { GridProps } from '../../components/grid';
import type { ScreenProps } from '../../components/screen';
import { ExtensionPageScreen } from './extension-page-screen';
import { uiRowFixture } from './ui-fixture';

const fixture = vi.hoisted(() => ({ width: 0 }));
const PaneWidth = createContext(0);
const paneLimits = { dashboard: Infinity, full: Infinity, detail: 1120, reading: 720 } as const;

function none(): null {
  return null;
}

vi.mock('react-native', () => ({
  View: ({
    children,
    className,
  }: {
    readonly children: ReactNode;
    readonly className?: string;
  }): ReactNode => createElement('div', { className }, children),
}));
vi.mock('../../design/platform', () => ({ useIdiom: (): 'pointer' => 'pointer' }));
vi.mock('../../design/theme', () => ({ useThemeSetting: (): 'comfortable' => 'comfortable' }));
vi.mock('../../components/grid', async (importOriginal) => {
  const { Grid } = await importOriginal<typeof GridModule>();
  return {
    Grid: (props: GridProps): ReactNode =>
      createElement(Grid, { ...props, measuredWidth: useContext(PaneWidth) }),
  };
});
vi.mock('../../components/screen', () => ({
  Screen: ({ maxWidth, children }: ScreenProps): ReactNode =>
    createElement(
      PaneWidth.Provider,
      { value: Math.min(fixture.width, paneLimits[maxWidth ?? 'dashboard']) },
      children,
    ),
}));
vi.mock('../../app-shell/hrefs', () => ({ href: { home: (): '/' => '/' } }));
vi.mock('../../components/button', () => ({ Button: none }));
vi.mock('../../components/empty-state', () => ({ EmptyState: none }));
vi.mock('../../components/page-header', () => ({ PageHeader: none }));
vi.mock('../../components/card', () => ({
  Card: ({ title }: { readonly title: string }): ReactNode => title,
}));
vi.mock('./body-view', () => ({ BodyView: none }));
vi.mock('./extension-icon', () => ({ extensionIcon: (): 'droplet' => 'droplet' }));
vi.mock('../../store/selectors', () => ({
  useRow: (): PluginUiRow =>
    uiRowFixture({
      pages: [
        {
          id: 'overview',
          title: 'Garden',
          icon: 'droplet',
          sections: Array.from({ length: 7 }, (_, index) => ({
            title: `Reading ${String(index + 1)}`,
            body: { type: 'figure', value: { stream: 'soil', field: null }, caption: null },
          })),
        },
      ],
    }),
}));

describe('Extension page layout', () => {
  it.each([
    [380, 7],
    [1112, 3],
    [3096, 1],
  ])('packs seven readable cards at pane width %s into %s rows', (width, rows) => {
    fixture.width = width;
    const page = renderToStaticMarkup(
      createElement(ExtensionPageScreen, { pluginId: 'garden', pageId: 'overview' }),
    );
    expect(page.match(/class="flex-row items-stretch gap-grid-gap"/gu)).toHaveLength(rows);
    expect(page.match(/max-w-reading/gu)).toHaveLength(7);
    expect(page).toContain('Reading 7');
  });
});
