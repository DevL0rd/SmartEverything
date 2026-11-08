import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ConnectionState } from '../../../api/transport';
import type { ListRowProps } from '../../../components/list-row';

const fixture = vi.hoisted(() => ({
  host: 'smarteverything-0123456789abcdef0123456789abcdef.local',
  row: vi.fn<(_: ListRowProps) => null>(() => null),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('../../../api/transport', () => ({
  chooseRemoteServer: vi.fn(),
  chooseThisComputer: vi.fn(),
  useConnection: (): ConnectionState => ({
    status: 'paired',
    kind: 'browser',
    connection: { url: `https://${fixture.host}`, token: `set_${'0'.repeat(64)}` },
  }),
}));
vi.mock('../../../components/confirm-store', () => ({ confirm: vi.fn() }));
vi.mock('../../../components/list-row', () => ({ ListRow: fixture.row }));
vi.mock('../../../components/rows', () => ({
  ActionRow: (): null => null,
  ValueRow: (): null => null,
}));
vi.mock('../../../components/section', () => ({ List: childrenOf }));
vi.mock('../../../components/toast-store', () => ({ notifyFailure: vi.fn() }));
vi.mock('../../../design/platform', () => ({ appPlatform: (): 'web' => 'web' }));
vi.mock('../../../store/selectors', () => ({
  useSettings: (): { readonly public_url: null } => ({ public_url: null }),
}));
vi.mock('./forget-pairing', () => ({ forgetPairing: vi.fn() }));

const { ThisDeviceSection } = await import('./this-device');

describe('This device server address', () => {
  it('keeps the full paired hostname readable', () => {
    renderToStaticMarkup(createElement(ThisDeviceSection));
    expect(fixture.row.mock.calls.map(([row]) => row)).toContainEqual(
      expect.objectContaining({ title: 'Server', subtitle: fixture.host, wrapSubtitle: true }),
    );
  });
});
