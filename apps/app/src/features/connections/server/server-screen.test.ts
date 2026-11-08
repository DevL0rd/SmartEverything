import { createElement, type ComponentProps, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { NavRow } from '../../../components/rows';

const fixture = vi.hoisted(() => ({
  owner: false,
  navRow: vi.fn<(_: ComponentProps<typeof NavRow>) => null>(() => null),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('../../../components/list-row', () => ({ ListRow: (): null => null }));
vi.mock('../../../components/rows', () => ({ NavRow: fixture.navRow }));
vi.mock('../../../components/section', () => ({ List: childrenOf }));
vi.mock('../../../settings/settings-frame', () => ({ SettingsFrame: childrenOf }));
vi.mock('../../../store/selectors', () => ({
  useFirewall: (): null => null,
  useIsOwner: (): boolean => fixture.owner,
}));
vi.mock('./public-url', () => ({ PublicUrlSection: (): null => null }));
vi.mock('./this-device', () => ({ ThisDeviceSection: (): null => null }));

const { ServerScreen } = await import('./server-screen');

describe('Server settings navigation', () => {
  it.each([true, false])('offers the Hub updates route only when owner is %s', (owner) => {
    fixture.owner = owner;
    fixture.navRow.mockClear();
    renderToStaticMarkup(createElement(ServerScreen));
    const rows = fixture.navRow.mock.calls.map(([row]) => row);
    const updates = rows.filter((row) => row.title === 'Hub updates');
    expect(updates.map((row) => row.href)).toEqual(
      owner ? [{ pathname: '/settings/[...page]', params: { page: ['app-updates'] } }] : [],
    );
    expect(rows.map((row) => row.title)).toContain('Diagnostics');
  });
});
