import { describe, expect, it, vi } from 'vitest';

vi.mock('react-native', () => ({ BackHandler: { addEventListener: vi.fn() } }));
vi.mock('expo-router', () => ({ router: {}, useFocusEffect: vi.fn(), useNavigation: vi.fn() }));
vi.mock('../design/platform', () => ({ isNative: (): boolean => true }));
vi.mock('./tree', () => ({ pageHref: vi.fn(), settingsPage: vi.fn() }));

const { routeSettingsId } = await import('./settings-back');

describe('the settings page a stack route shows', () => {
  it('reads the global catch-all', () => {
    expect(routeSettingsId({ name: '[...page]', params: { page: ['plugins', 'abc'] } })).toBe(
      'plugins/abc',
    );
  });

  it('reads the settings index as the home page', () => {
    expect(routeSettingsId({ name: 'index' })).toBe('home');
  });

  it('reads a nested catch-all route', () => {
    expect(
      routeSettingsId({ name: '[...page]', params: { page: ['talk', 'channels', 'abc'] } }),
    ).toBe('talk/channels/abc');
  });

  it('reads a dynamic segment route', () => {
    expect(routeSettingsId({ name: 'profiles/[profileId]', params: { profileId: 'p1' } })).toBe(
      'profiles/p1',
    );
  });
});
