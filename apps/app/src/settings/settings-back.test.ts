import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ BackHandler: { addEventListener: vi.fn() } }));
vi.mock('expo-router', () => ({ router: {}, useFocusEffect: vi.fn(), useNavigation: vi.fn() }));
vi.mock('../design/platform', () => ({ isNative: (): boolean => true }));
vi.mock('./tree', () => ({ pageHref: vi.fn(), settingsPage: vi.fn() }));

const { routeSettingsId } = await import('./settings-back');

describe('the settings page a stack route shows', () => {
  it('reads the global catch-all', () => {
    expect(
      routeSettingsId({ name: '[...page]', params: { page: ['plugins', 'abc'] } }, 'settings'),
    ).toBe('plugins/abc');
  });

  it('reads the settings index as the home page', () => {
    expect(routeSettingsId({ name: 'index' }, 'settings')).toBe('home');
  });

  it('reads a page-owned settings route', () => {
    expect(
      routeSettingsId({ name: 'talk/settings/[...page]', params: { page: ['channels'] } }, ''),
    ).toBe('talk/channels');
    expect(routeSettingsId({ name: 'fitness/settings/index' }, '')).toBe('health');
  });

  it('is nothing for other screens', () => {
    expect(routeSettingsId({ name: 'talk/index' }, '')).toBeNull();
  });
});
