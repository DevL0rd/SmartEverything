import { createElement, Fragment, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { PluginToolRow } from '@smarteverything/domain';
import { flattenSections, type VirtualSection } from '../../../components/virtual-list-rows';

const catalogue = vi.hoisted(() => ({ data: new Array<PluginToolRow>() }));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('../../../components/text', () => ({ Text: childrenOf }));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: childrenOf }));
vi.mock('../../../components/empty-state', () => ({ EmptyState: (): null => null }));
vi.mock('../../../components/error-state', () => ({ ErrorState: (): null => null }));
vi.mock('../../../components/rows', () => ({
  SwitchRow: ({ label }: { readonly label: string }): ReactNode => label,
}));
vi.mock('../../../components/search-field', () => ({ SearchField: (): null => null }));
vi.mock('../../../components/skeleton', () => ({ Skeleton: (): null => null }));

vi.mock('../../../app-shell/hrefs', () => ({
  href: { pluginSettings: (id: string): string => `/settings/plugins/${id}` },
}));

vi.mock('../data/plugin-actions', () => ({ changePlugin: vi.fn() }));

vi.mock('../data/plugin-queries', () => ({
  usePluginTools: (): { readonly data: readonly PluginToolRow[]; readonly isError: boolean } => ({
    data: catalogue.data,
    isError: false,
  }),
}));

vi.mock('./plugin-screen', () => ({
  MissingPlugin: (): null => null,
  usePluginParam: (): {
    readonly id: string;
    readonly status: string;
    readonly manifest: { readonly name: string };
  } => ({ id: 'fixture', status: 'running', manifest: { name: 'Fixture plugin' } }),
}));

vi.mock('../../../components/virtual-list', () => ({
  VirtualList: ({
    sections,
    keyOf,
    empty,
    renderItem,
  }: {
    readonly sections: readonly VirtualSection<PluginToolRow>[];
    readonly keyOf: (tool: PluginToolRow) => string;
    readonly empty: ReactNode;
    readonly renderItem: (tool: PluginToolRow) => ReactNode;
  }): ReactNode =>
    flattenSections(sections, keyOf).length === 0
      ? empty
      : sections.flatMap((section) =>
          section.data.map((tool) =>
            createElement(Fragment, { key: keyOf(tool) }, renderItem(tool)),
          ),
        ),
}));

const { PluginToolsScreen } = await import('./plugin-tools-screen');

describe('Plugin tools', () => {
  it('renders the explanation when a running plugin offers zero tools', () => {
    catalogue.data = [];
    const html = renderToStaticMarkup(createElement(PluginToolsScreen, { pluginId: 'fixture' }));
    expect(html).toContain('This plugin offers no tools.');
  });

  it('names same-title switches with the permission and distinct tool identifier', () => {
    const common = { title: 'Manage files', description: '', human_only: false, enabled: true };
    catalogue.data = [
      { ...common, name: 'list_files', read_only: true, destructive: false },
      { ...common, name: 'delete_files', read_only: false, destructive: true },
    ];
    const html = renderToStaticMarkup(createElement(PluginToolsScreen, { pluginId: 'fixture' }));
    expect(html).toContain('Manage files · Reads · list_files');
    expect(html).toContain('Manage files · Can remove things · delete_files');
  });
});
