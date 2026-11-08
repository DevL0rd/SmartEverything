import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import { PLUGIN_ROW, type PluginToolRow } from '@smarteverything/domain';

const query = vi.hoisted((): { data: readonly PluginToolRow[] | undefined; isError: boolean } => ({
  data: undefined,
  isError: false,
}));

vi.mock('expo-router', () => ({ useRouter: vi.fn() }));
vi.mock('../../../app-shell/hrefs', () => ({
  href: {
    pluginSettings: (id: string, page: string): string => `/settings/plugins/${id}/${page}`,
  },
}));
vi.mock('../../../components/confirm-store', () => ({ confirm: vi.fn() }));
vi.mock('../../../components/list-row', () => ({ ListRow: vi.fn() }));
vi.mock('../../../components/rows', () => ({
  ActionRow: vi.fn(),
  SwitchRow: vi.fn(),
  NavRow: ({ href, value }: { readonly href: string; readonly value: string }): ReactNode =>
    createElement('a', { href }, value),
}));
vi.mock('../../../components/section', () => ({
  List: ({ children }: { readonly children: ReactNode }): ReactNode => children,
}));
vi.mock('../../../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../../../plugins/shared/plugin-action', () => ({ PluginActionRow: vi.fn() }));
vi.mock('../../../plugins/use-plugin-tool', () => ({ usePluginTool: vi.fn() }));
vi.mock('../data/plugin-actions', () => ({
  changePlugin: vi.fn(),
  remove: vi.fn(),
  restart: vi.fn(),
  switchPlugin: vi.fn(),
}));
vi.mock('../data/plugin-queries', () => ({ usePluginTools: (): typeof query => query }));

const { ToolRows } = await import('./plugin-detail-rows');

describe('Plugin detail Tools row', () => {
  it.each([
    { status: 'running', isError: false, data: undefined, value: 'Loading…' },
    { status: 'running', isError: true, data: undefined, value: 'Unavailable' },
    { status: 'running', isError: false, data: [], value: 'No tools' },
    { status: 'disabled', isError: false, data: undefined, value: 'When it runs' },
  ] as const)('keeps the Tools link available with $value', ({ status, isError, data, value }) => {
    Object.assign(query, { isError, data });
    const row = PLUGIN_ROW.parse({
      id: 'fixture',
      manifest: {
        id: 'fixture',
        name: 'Fixture',
        version: '1.0.0',
        description: 'A fixture plugin',
        publisher: 'Fixture',
      },
      source: 'builtin',
      location: null,
      enabled: status === 'running',
      trusted: false,
      status,
      status_detail: null,
      tool_switches: {},
      settings: {},
      secret_names: [],
      icon_url: null,
      installed_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
    });
    const html = renderToStaticMarkup(createElement(ToolRows, { row }));
    expect(html).toContain(`<a href="/settings/plugins/fixture/tools">${value}</a>`);
  });
});
