import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ProviderLinkRow } from '@smarteverything/domain';

const state = vi.hoisted((): { row: ProviderLinkRow | null } => ({ row: null }));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('expo-router', () => ({
  useLocalSearchParams: (): { readonly provider: 'xiaomi' } => ({ provider: 'xiaomi' }),
}));
vi.mock('../../../app-shell/hrefs', () => ({
  href: { connect: (provider: string): string => `/connect/${provider}` },
}));
vi.mock('../../../components/banner', () => ({ Banner: (): null => null }));
vi.mock('../../../components/brand-mark', () => ({ BrandMark: (): null => null }));
vi.mock('../../../components/button', () => ({
  Button: ({ label, href }: { readonly label: string; readonly href: string }): ReactNode =>
    createElement('a', { href }, label),
}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({
    title,
    body,
    action,
  }: {
    readonly title: string;
    readonly body: string;
    readonly action: ReactNode;
  }): ReactNode => createElement('div', null, title, body, action),
}));
vi.mock('../../../components/text', () => ({ Text: childrenOf }));
vi.mock('../../../store/selectors', () => ({
  useProviderLink: (): ProviderLinkRow | null => state.row,
}));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: childrenOf }));
vi.mock('./account-rows', () => ({ AccountRows: (): null => null }));

const { AccountScreen } = await import('./account-screen');

describe('Provider account details', () => {
  it('shows the disconnected explanation once with a link to sign in', () => {
    const html = renderToStaticMarkup(createElement(AccountScreen));
    expect(html.match(/Mi Home devices/g)).toHaveLength(1);
    expect(html).toContain('Not connected');
    expect(html).toContain('href="/connect/xiaomi"');
  });

  it('shows the account name and device count when connected', () => {
    state.row = {
      provider: 'xiaomi',
      status: 'linked',
      account_label: 'Fixture account',
      device_count: 3,
      phase: null,
      problem: null,
      prompt: null,
      last_error: null,
      updated_at: '2026-01-01T00:00:00.000Z',
    };
    try {
      const html = renderToStaticMarkup(createElement(AccountScreen));
      expect(html).toContain('Fixture account · 3 devices');
      expect(html).not.toContain('Not connected');
    } finally {
      state.row = null;
    }
  });
});
