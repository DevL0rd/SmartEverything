import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-router', () => ({ usePathname: (): string => '' }));
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));

const { CALL_PATH, inShareOf, surfaceOf } = await import('./overlay-surface');
const { IDLE_CALL } = await import('../call/call-state');

const FACTS = { focused: true, visible: true, foreground: true, pathname: '/home' };

describe('the desktop surface', () => {
  it('is the call page only while the window is focused, visible and on the call route', () => {
    const call = surfaceOf('desktop', { ...FACTS, pathname: CALL_PATH }, false);
    expect(call).toEqual({ platform: 'desktop', main: 'call', inShare: false });
  });

  it('is another page while the window is focused anywhere else in the app', () => {
    expect(surfaceOf('desktop', FACTS, false)).toEqual({
      platform: 'desktop',
      main: 'other',
      inShare: false,
    });
  });

  it('is away when the window lost focus, even on the call route', () => {
    const blurred = { ...FACTS, focused: false, pathname: CALL_PATH };
    expect(surfaceOf('desktop', blurred, false)).toMatchObject({ main: 'away' });
  });

  it('is away when the window is hidden to the tray', () => {
    expect(surfaceOf('desktop', { ...FACTS, visible: false }, true)).toEqual({
      platform: 'desktop',
      main: 'away',
      inShare: true,
    });
  });
});

describe('the phone surface', () => {
  it('is the call page only while the app is in front on the call route', () => {
    const call = surfaceOf('phone', { ...FACTS, pathname: CALL_PATH }, false);
    expect(call).toEqual({ platform: 'phone', main: 'call' });
  });

  it('is another page while the app is in front anywhere else', () => {
    expect(surfaceOf('phone', FACTS, false)).toEqual({ platform: 'phone', main: 'other' });
  });

  it('is away when the app is in the background, even on the call route', () => {
    const background = { ...FACTS, foreground: false, pathname: CALL_PATH };
    expect(surfaceOf('phone', background, true)).toEqual({ platform: 'phone', main: 'away' });
  });

  it('ignores the window focus that only the desktop tracks', () => {
    expect(surfaceOf('phone', { ...FACTS, focused: false, visible: false }, false)).toEqual({
      platform: 'phone',
      main: 'other',
    });
  });
});

describe('sharing the whole screen', () => {
  const live = { ...IDLE_CALL, phase: 'listening' as const };

  it('is true only for a live call sharing the desktop screen', () => {
    const sharing = { ...live, sight: { source: 'desktop_screen' as const, label: null } };
    expect(inShareOf(sharing)).toBe(true);
    expect(inShareOf({ ...sharing, phase: 'ended' })).toBe(false);
    expect(inShareOf({ ...live, sight: { source: 'desktop_window', label: 'Terminal' } })).toBe(
      false,
    );
    expect(inShareOf(live)).toBe(false);
  });
});
