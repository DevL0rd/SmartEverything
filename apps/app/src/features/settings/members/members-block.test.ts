import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ClientRow } from '@smarteverything/domain';

const clients = vi.hoisted(() => new Array<ClientRow>());

vi.mock('react-native', () => ({}));
vi.mock('../../../api/settings', () => ({}));
vi.mock('../../../components/button', () => ({}));
vi.mock('../../../components/confirm-store', () => ({}));
vi.mock('../../../components/empty-state', () => ({
  EmptyState: ({ title, body }: { readonly title: string; readonly body: string }): ReactNode =>
    createElement('div', null, title, body),
}));
vi.mock('../../../components/list-row', () => ({
  ListRow: ({
    title,
    onPress,
  }: {
    readonly title: string;
    readonly onPress?: () => void;
  }): ReactNode => createElement(onPress === undefined ? 'div' : 'button', null, title),
}));
vi.mock('../../../components/section', () => ({
  List: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('section', null, children),
}));
vi.mock('../../../components/segmented', () => ({}));
vi.mock('../../../components/sheet', () => ({}));
vi.mock('../../../components/text', () => ({}));
vi.mock('../../../components/toast-store', () => ({}));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => 0 }));
vi.mock('../../../store/selectors', () => ({
  useRows: (): readonly ClientRow[] => clients,
  useSession: (): { readonly client: { readonly id: string } } => ({ client: { id: 'mine' } }),
}));
vi.mock('./client-profile', () => ({}));

const { MembersBlock } = await import('./members-block');

function client(id: string, name: string, builtIn = false): ClientRow {
  return {
    id,
    name,
    platform: 'android',
    kind: 'phone',
    role: 'owner',
    built_in: builtIn,
    profile_id: null,
    created_at: '2026-10-01T00:00:00.000Z',
    last_seen_at: null,
  };
}

describe('Paired devices', () => {
  beforeEach(() => {
    clients.length = 0;
  });

  it('shows an empty message instead of an empty list', () => {
    const markup = renderToStaticMarkup(createElement(MembersBlock));
    expect(markup).toContain('No paired devices');
    expect(markup).not.toContain('<section');
  });

  it('shows no paired devices when only the hub identity exists', () => {
    clients.push(client('built-in', 'This computer', true));
    const markup = renderToStaticMarkup(createElement(MembersBlock));
    expect(markup).toContain('No paired devices');
    expect(markup).not.toContain('This computer');
  });

  it('opens editing only for a different device that can be unpaired', () => {
    clients.push(client('mine', 'This phone'), client('built-in', 'Home computer', true));
    clients.push(client('other', 'Other phone'));
    const markup = renderToStaticMarkup(createElement(MembersBlock));
    expect(markup).toContain('<div>This phone</div>');
    expect(markup).not.toContain('Home computer');
    expect(markup).toContain('<button>Other phone</button>');
    expect(markup).not.toContain('No paired devices');
  });
});
