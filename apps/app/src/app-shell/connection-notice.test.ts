import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConnectionState } from '../api/transport';
import type { UpdateNoticeProps } from '../components/update-notice';
import type { SyncStatus } from '../store/selectors';

interface Seen {
  connection: ConnectionState;
  sync: SyncStatus;
}

const seen = vi.hoisted((): Seen => ({
  connection: { status: 'loading' },
  sync: { status: 'live', problem: null, failed: [] },
}));

vi.mock('expo-router', () => ({ usePathname: (): string => '/home' }));
vi.mock('react-native', () => ({
  View: ({ children }: { readonly children: ReactNode }): ReactNode =>
    createElement('section', null, children),
}));
vi.mock('../api/transport', () => ({ useConnection: (): ConnectionState => seen.connection }));
vi.mock('../store/selectors', () => ({ useSyncStatus: (): SyncStatus => seen.sync }));
vi.mock('./hrefs', () => ({
  UPDATES_SETTINGS_PAGE: 'app-updates',
  href: { settings: { page: (page: string): string => `/settings/${page}` } },
}));
vi.mock('./section-failure', () => ({
  sectionFailureText: (failure: { readonly section: string; readonly reason: string }): string =>
    `${failure.section}: ${failure.reason}`,
}));
vi.mock('../components/update-notice', () => ({
  ShellNotice: (props: UpdateNoticeProps): ReactNode =>
    createElement(
      'div',
      { 'data-href': props.action?.href },
      props.title,
      ' | ',
      props.body,
      ' | ',
      props.action?.label,
    ),
}));

const { updateNoticesShown } = await import('../components/update-notice-presence');
const { ConnectionNoticeHost } = await import('./connection-notice');

const PAIRED: ConnectionState = {
  status: 'paired',
  kind: 'phone',
  connection: { url: 'https://hub.test', token: `set_${'0'.repeat(64)}` },
};

function shown(): string {
  return renderToStaticMarkup(createElement(ConnectionNoticeHost));
}

describe('the connection notice', () => {
  beforeEach(() => {
    seen.connection = PAIRED;
    seen.sync = { status: 'live', problem: null, failed: [] };
    updateNoticesShown.set(0);
  });

  it('shows nothing when the app is connected and every section is readable', () => {
    expect(shown()).toBe('');
  });

  it('shows the connection notice while offline', () => {
    seen.sync = { status: 'interrupted', problem: null, failed: [] };
    expect(shown()).toContain('Reconnecting');
  });

  it('shows the server problem with a way to the server settings', () => {
    seen.sync = {
      status: 'interrupted',
      problem: { text: 'The server is not answering.', remedy: 'server-settings' },
      failed: [],
    };
    const html = shown();
    expect(html).toContain('Can’t reach your server');
    expect(html).toContain('Server settings');
    expect(html).toContain('data-href="/settings/server"');
  });

  it('gives way to an update notice when both apply', () => {
    seen.sync = { status: 'interrupted', problem: null, failed: [] };
    updateNoticesShown.set(1);
    expect(shown()).toBe('');
  });

  it('points to Updates when a section is unreadable', () => {
    seen.sync = {
      status: 'live',
      problem: null,
      failed: [{ section: 'drive', reason: 'needs a newer app' }],
    };
    const html = shown();
    expect(html).toContain('Update the app to see everything');
    expect(html).toContain('drive: needs a newer app');
    expect(html).toContain('Updates');
    expect(html).toContain('data-href="/settings/app-updates"');
  });

  it('shows when the device is not paired', () => {
    seen.connection = { status: 'unpaired', kind: 'phone', fixedUrl: null };
    expect(shown()).toContain('Not paired with a server');
  });
});
