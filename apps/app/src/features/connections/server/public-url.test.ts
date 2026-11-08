import { createElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { SettingsRow } from '@smarteverything/domain';
import type { ListRowProps } from '../../../components/list-row';

type PublicUrlSettings = Pick<
  SettingsRow,
  'public_url' | 'public_url_error' | 'public_url_verified_at' | 'time_zone'
>;

const fixture = vi.hoisted(() => ({
  rows: vi.fn<(_: ListRowProps) => null>(() => null),
  failure: 'The example certificate chain could not be verified. '.repeat(4),
}));

function childrenOf({ children }: { readonly children: ReactNode }): ReactNode {
  return children;
}

vi.mock('react-native', () => ({ View: childrenOf }));
vi.mock('../../../api/access', () => ({ setPublicUrl: vi.fn(), verifyPublicUrl: vi.fn() }));
vi.mock('../../../components/list-row', () => ({ ListRow: fixture.rows }));
vi.mock('../../../components/section', () => ({ List: childrenOf }));
vi.mock('../../../settings/text-edit-sheet', () => ({ TextEditSheet: (): null => null }));
vi.mock('../../../store/clock', () => ({ useMinute: (): number => 0 }));
vi.mock('../../../store/mutation', () => ({
  useMutationState: (): { readonly busy: boolean } => ({ busy: false }),
}));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => true,
  useSettings: (): PublicUrlSettings => ({
    public_url: 'https://fixture.invalid',
    public_url_error: fixture.failure,
    public_url_verified_at: null,
    time_zone: 'UTC',
  }),
}));
vi.mock('../../../store/store-context', () => ({ useEntityStore: (): null => null }));

const { PublicUrlSection } = await import('./public-url');

describe('Remote access verification', () => {
  it('keeps the full verification error readable in the retry row', () => {
    renderToStaticMarkup(createElement(PublicUrlSection));
    expect(fixture.rows.mock.calls.map(([row]) => row)).toContainEqual(
      expect.objectContaining({
        label: 'Check the public address again',
        subtitle: fixture.failure,
        wrapSubtitle: true,
      }),
    );
  });
});
