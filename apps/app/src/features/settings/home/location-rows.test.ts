import type { SettingsRow } from '@smarteverything/domain';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

interface Selection {
  readonly value: string | null;
  readonly onChange: (value: string) => void;
}

const fixture = vi.hoisted(() => ({
  select: vi.fn<(_: Selection) => null>(() => null),
  updateHome: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../../../api/settings', () => ({ updateHome: fixture.updateHome }));
vi.mock('../../../components/list-row', () => ({ ListRow: (): null => null }));
vi.mock('../../../components/rows', () => ({
  ActionRow: (): null => null,
  SelectRow: fixture.select,
  ValueRow: (): null => null,
}));
vi.mock('../../../components/toast-store', () => ({ notifyFailure: vi.fn() }));
vi.mock('../../../settings/text-edit-sheet', () => ({ TextEditSheet: (): null => null }));
vi.mock('../../../store/selectors', () => ({
  useIsOwner: (): boolean => true,
  useSettings: (): Pick<SettingsRow, 'time_zone'> => ({
    time_zone: 'America/Argentina/ComodRivadavia',
  }),
}));

const { TimeZoneRow } = await import('./location-rows');

describe('Home time zone picker', () => {
  it('shows the matching option and preserves the stored alias until a different zone is chosen', () => {
    renderToStaticMarkup(createElement(TimeZoneRow));
    const selection = fixture.select.mock.lastCall?.[0];
    expect(selection?.value).toBe('America/Catamarca');
    selection?.onChange('America/Catamarca');
    expect(fixture.updateHome).not.toHaveBeenCalled();
    selection?.onChange('Europe/London');
    expect(fixture.updateHome).toHaveBeenCalledExactlyOnceWith({ time_zone: 'Europe/London' });
  });
});
