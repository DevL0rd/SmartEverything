import { describe, expect, it, vi } from 'vitest';
import type { NavPin, NavigationLayout } from '@smarteverything/domain';
import { emptyState } from '../store/state';

vi.mock('../api/transport', () => ({
  api: (): { call: () => Promise<unknown> } => ({ call: () => Promise.resolve({}) }),
}));
vi.mock('../components/toast-store', () => ({ notify: vi.fn() }));
vi.mock('../components/confirm-store', () => ({
  confirm: (): Promise<boolean> => Promise.resolve(true),
}));
vi.mock('expo-crypto', () => ({ randomUUID: (): string => 'abcd-ef01-2345-6789' }));
vi.mock('expo-router', () => ({ router: { navigate: vi.fn() } }));
vi.mock('./routes', () => ({
  TAB_ROUTES: ['home', 'devices', 'cameras', 'fitness', 'assistant', 'talk', 'automations'].map(
    (tab) => ({ key: tab, tab, available: (): boolean => true }),
  ),
  ROUTES: [],
}));
vi.mock('../features/device-visuals', () => ({ deviceIcon: (): string => 'bulb' }));
vi.mock('../settings/tree', () => ({ settingsPage: (): undefined => undefined }));
vi.mock('../settings/registry', () => ({ settingPageOf: (): undefined => undefined }));

const { landing } = await import('./nav-layout');
const { availabilityOf } = await import('../store/selectors');

const DEVICE = '11111111-1111-4111-8111-111111111111';

const pin = (id: string): NavPin => ({
  kind: 'pin',
  id,
  target: { kind: 'device', deviceId: DEVICE, focus: null },
  title: null,
  icon: null,
});

const availability = availabilityOf(emptyState());

describe('where a new pin lands', () => {
  it('is in the bar on a phone while the bar has a free slot', () => {
    const layout: NavigationLayout = {
      items: [{ kind: 'section', section: 'home' }, pin('a')],
      hidden: ['devices', 'cameras', 'fitness', 'talk', 'automations'],
    };
    expect(landing(layout, availability, 'bar')).toBe('Pinned · in the bar');
  });

  it('is in the sheet on a phone once the bar is full', () => {
    expect(landing({ items: null, hidden: [] }, availability, 'bar')).toBe('Pinned · in the sheet');
  });

  it('only says it is pinned where there is no bar', () => {
    expect(landing({ items: null, hidden: [] }, availability, 'sidebar')).toBe(
      'Pinned to navigation',
    );
    expect(landing({ items: null, hidden: [] }, availability, 'rail')).toBe('Pinned to navigation');
  });
});
