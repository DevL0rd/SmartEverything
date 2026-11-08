import { FIREWALL_STATUS } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { ListRowProps } from '../../../components/list-row';

const fixture = vi.hoisted(() => ({
  id: '00000000-0000-4000-8000-000000000009',
  name: 'Fixture camera ' + 'long-name-'.repeat(8),
  row: vi.fn<(_: ListRowProps) => null>(() => null),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('../../../components/badge', () => ({ Badge: (): null => null }));
vi.mock('../../../components/list-row', () => ({ ListRow: fixture.row }));
vi.mock('../../../components/section', () => ({ List: childrenOf }));
vi.mock('../../../store/store-context', () => ({
  useStoreSelector: (): Readonly<Record<string, { readonly label: string }>> => ({
    [fixture.id]: { label: fixture.name },
  }),
}));

const { FirewallLists } = await import('./firewall-lists');

describe('Firewall detail names', () => {
  it('keeps both names and address details readable in the openings and camera rows', () => {
    const mac = '00:11:22:33:44:55';
    const address = '2001:db8:ffff:ffff:ffff:ffff:ffff:fff0';
    const firewall = FIREWALL_STATUS.parse({
      checkedAt: '2026-11-06T01:00:00Z',
      backend: 'ufw',
      filtering: true,
      detail: 'Fixture firewall',
      plan: null,
      openings: [
        {
          id: 'fixture-camera-opening',
          deviceIds: [fixture.id],
          rule: { purpose: 'camera', protocol: 'udp', mac, address },
          state: 'missing',
        },
      ],
      cameras: [{ deviceId: fixture.id, mac, address, state: 'needs_rule', failedAt: null }],
    });
    renderToStaticMarkup(createElement(FirewallLists, { firewall }));
    const rows = fixture.row.mock.calls.map(([row]) => row);
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(row).toMatchObject({ title: fixture.name, wrapTitle: true, wrapSubtitle: true });
      expect(row.subtitle).toContain(address);
    }
  });
});
