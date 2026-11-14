import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { GoogleAccountRow, ProfileRow, ProviderLinkRow } from '@smarteverything/domain';

const ME = '00000000-0000-4000-8000-000000000001';
const ALEX = '00000000-0000-4000-8000-000000000002';

const state = vi.hoisted(
  (): {
    owner: boolean;
    me: string;
    tables: Record<string, readonly unknown[]>;
  } => ({ owner: true, me: '', tables: {} }),
);

function childrenOf({ children }: { readonly children?: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('../../../app-shell/hrefs', () => ({
  href: {
    settings: {
      page: (path: string): string => `/settings/${path}`,
      account: (provider: string): string => `/settings/connections/${provider}`,
    },
  },
}));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => state.owner,
  useRows: (table: string): readonly unknown[] => state.tables[table] ?? [],
  useSession: (): { readonly client: { readonly profile_id: string } } => ({
    client: { profile_id: state.me },
  }),
}));
vi.mock('../../../design/platform', () => ({ useIdiom: (): 'touch' => 'touch' }));
vi.mock('../../../components/list-row', () => ({
  ListRow: ({
    title,
    subtitle,
    href,
  }: {
    readonly title: string;
    readonly subtitle?: string;
    readonly href?: unknown;
  }): ReactNode => createElement('a', { 'data-href': JSON.stringify(href) }, title, ' ', subtitle),
}));
vi.mock('../../../components/section', () => ({
  List: ({
    title,
    caption,
    footer,
    children,
  }: {
    readonly title?: string;
    readonly caption?: string;
    readonly footer?: string;
    readonly children: ReactNode;
  }): ReactNode => createElement('section', null, title, ' ', caption, children, footer),
}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({ title }: { readonly title: string }): ReactNode =>
    createElement('div', null, title),
}));
vi.mock('../../../components/button', () => ({ Button: (): null => null }));
vi.mock('../../profiles', () => ({ ProfileAvatar: (): null => null }));
vi.mock('../google/google-mark', () => ({ GoogleMark: (): null => null }));
vi.mock('../row-brand', () => ({ RowBrand: (): null => null }));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: childrenOf }));
vi.mock('./use-account-back-focus', () => ({
  useAccountBackFocus: (): (() => void) => () => undefined,
}));

const { AccountsScreen } = await import('./accounts-screen');

function profile(id: string, name: string): Pick<ProfileRow, 'id' | 'name' | 'colour'> {
  return { id, name, colour: 'aqua' };
}

const XIAOMI: ProviderLinkRow = {
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

const ALEX_GOOGLE: GoogleAccountRow = {
  profile_id: ALEX,
  email: null,
  scopes: [],
  status: 'needs_attention',
  problem: 'invalid_grant',
  calendar_ids: [],
  list_ids: [],
  last_sync_at: null,
  last_error: null,
};

function render(owner: boolean, me: string): string {
  state.owner = owner;
  state.me = me;
  state.tables = {
    provider_links: [XIAOMI],
    profiles: [profile(ME, 'Pat'), profile(ALEX, 'Alex')],
    google_accounts: [ALEX_GOOGLE],
  };
  return renderToStaticMarkup(createElement(AccountsScreen));
}

describe('Accounts', () => {
  it('shows the owner the device accounts and every person’s Google row', () => {
    const html = render(true, ME);
    expect(html).toContain('Device accounts owner only');
    expect(html).toContain('Xiaomi');
    expect(html).toContain('Services');
    expect(html).toContain('Google · You Not linked');
    expect(html).toContain('Google · Alex Needs attention · Google signed Alex out');
    expect(html.indexOf('Google · You')).toBeLessThan(html.indexOf('Google · Alex'));
    expect(html).toContain(`&quot;person&quot;:&quot;${ALEX}&quot;`);
  });

  it('shows a member only their own Google row and no device accounts', () => {
    const html = render(false, ALEX);
    expect(html).not.toContain('Device accounts owner only');
    expect(html).not.toContain('Xiaomi');
    expect(html).not.toContain('Pat');
    expect(html).toContain('Google Needs attention · Google signed you out');
    expect(html).toContain('Device accounts belong to the owner. Ask them to add one.');
  });
});
