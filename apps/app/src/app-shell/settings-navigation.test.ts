import { describe, expect, it, vi } from 'vitest';
import type { NavigationAction, NavigationState } from 'expo-router/react-navigation';

vi.mock('expo-crypto', () => ({ randomUUID: (): string => 'fresh' }));
vi.mock('expo-router', () => ({ useRootNavigationState: vi.fn() }));

const { hasSettingsOrigin, prepareSettingsVisit, retainSettingsOrigin } =
  await import('./settings-navigation');

function tabs(current: string, history: { type: 'route'; key: string }[] = []): NavigationState {
  return {
    key: 'tabs',
    index: ['(home)', '(cameras)', '(settings)'].indexOf(current),
    routeNames: ['(home)', '(cameras)', '(settings)'],
    routes: [
      { key: '(home)-1', name: '(home)' },
      { key: '(cameras)-1', name: '(cameras)' },
      { key: '(settings)-1', name: '(settings)', state: { key: 'stack', routes: [] } },
    ],
    history,
    type: 'tab',
    stale: false,
  };
}

const toSettings: NavigationAction = {
  type: 'JUMP_TO',
  payload: { name: '(settings)', params: { screen: 'settings', params: { screen: 'cameras' } } },
};

const toHome: NavigationAction = { type: 'JUMP_TO', payload: { name: '(home)' } };

describe('arriving in Settings from a page', () => {
  it('gives Settings a fresh route so it opens on the requested page', () => {
    const next = prepareSettingsVisit(tabs('(cameras)'), toSettings);
    const settings = next.routes.find((route) => route.name === '(settings)');
    expect(settings?.key).toBe('(settings)-fresh');
    expect(settings?.state).toBeUndefined();
  });

  it('marks every nested screen of the destination as the initial one', () => {
    prepareSettingsVisit(tabs('(cameras)'), toSettings);
    expect(toSettings.payload).toMatchObject({
      params: { initial: true, screen: 'settings', params: { initial: true } },
    });
  });

  it('leaves the state alone when already inside Settings or going elsewhere', () => {
    const inside = tabs('(settings)');
    expect(prepareSettingsVisit(inside, toSettings)).toBe(inside);
    const cameras = tabs('(cameras)');
    expect(prepareSettingsVisit(cameras, toHome)).toBe(cameras);
  });
});

describe('remembering the page Settings was opened from', () => {
  it('keeps the source tab right behind Settings in the history', () => {
    const previous = tabs('(cameras)');
    const next = { ...tabs('(settings)'), routes: tabs('(settings)').routes };
    const kept = retainSettingsOrigin(previous, toSettings, next);
    expect(kept).toMatchObject({
      history: [
        { type: 'route', key: '(cameras)-1' },
        { type: 'route', key: '(settings)-1' },
      ],
    });
  });

  it('does not touch other navigation', () => {
    const previous = tabs('(cameras)');
    const next = tabs('(home)');
    expect(retainSettingsOrigin(previous, toHome, next)).toBe(next);
    expect(retainSettingsOrigin(previous, toSettings, null)).toBeNull();
  });

  it('does nothing when Settings is already the source', () => {
    const previous = tabs('(settings)');
    const next = tabs('(settings)');
    expect(retainSettingsOrigin(previous, toSettings, next)).toBe(next);
  });
});

describe('detecting that Settings has an origin page', () => {
  it('is true on Settings when the history has an earlier tab', () => {
    const history = [
      { type: 'route' as const, key: '(cameras)-1' },
      { type: 'route' as const, key: '(settings)-1' },
    ];
    expect(hasSettingsOrigin(tabs('(settings)', history))).toBe(true);
  });

  it('is false on Settings opened directly, or on any other tab', () => {
    expect(hasSettingsOrigin(tabs('(settings)', [{ type: 'route', key: '(settings)-1' }]))).toBe(
      false,
    );
    expect(hasSettingsOrigin(tabs('(cameras)'))).toBe(false);
  });

  it('is false when the remembered tab no longer exists', () => {
    const history = [
      { type: 'route' as const, key: 'gone' },
      { type: 'route' as const, key: '(settings)-1' },
    ];
    expect(hasSettingsOrigin(tabs('(settings)', history))).toBe(false);
  });
});
