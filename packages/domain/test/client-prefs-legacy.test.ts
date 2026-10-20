import { describe, expect, it } from 'vitest';
import { CLIENT_PREFS, layoutScopeOf } from '../src/client-prefs';

describe('the saved appearance before the current version', () => {
  const { appearance } = CLIENT_PREFS;
  const OLD = {
    accent: 'rose',
    background: 'drift',
    surface: 'glass',
    corners: 'round',
    density: 'cozy',
    motion: 'reduced',
  };

  it('migrates the old words to the current ones', () => {
    expect(appearance.decode(OLD)).toStrictEqual({
      status: 'stored',
      migrated: true,
      value: {
        theme: 'system',
        accent: 'rose',
        background: 'ambient',
        surface: 'translucent',
        corners: 'round',
        density: 'comfortable',
        motion: 'reduced',
      },
    });
  });

  it('keeps an old off background and maps the plain choices', () => {
    const read = appearance.decode({
      ...OLD,
      background: 'off',
      surface: 'outline',
      density: 'compact',
    });
    expect(read).toMatchObject({
      status: 'stored',
      value: { background: 'off', surface: 'solid', density: 'compact' },
    });
  });

  it('refuses a value that is neither current nor old', () => {
    expect(appearance.decode({ ...OLD, accent: 'teal' }).status).toBe('invalid');
  });
});

describe('the saved call ring before the current version', () => {
  const { call_ring: ring } = CLIENT_PREFS;

  it('turns a muted flag into sound off', () => {
    expect(ring.decode({ muted: true })).toStrictEqual({
      status: 'stored',
      migrated: true,
      value: { sound: false, mutedUntil: null },
    });
    expect(ring.decode({ muted: false })).toMatchObject({ value: { sound: true } });
  });

  it('refuses a flag that is not a boolean', () => {
    expect(ring.decode({ muted: 'yes' }).status).toBe('invalid');
  });
});

describe('the saved camera preference before the current version', () => {
  const { cameras } = CLIENT_PREFS;

  it('forces muted for the first version and keeps the flag for the second', () => {
    const value = { awayMode: 'direct', muted: false };
    expect(cameras.decode({ version: 1, value })).toMatchObject({
      status: 'stored',
      migrated: true,
      value: { muted: true },
    });
    expect(cameras.decode({ version: 2, value })).toMatchObject({
      status: 'stored',
      migrated: true,
      value: { muted: false },
    });
  });

  it('refuses an unknown older version', () => {
    expect(cameras.decode({ version: 0, value: { awayMode: 'direct', muted: true } }).status).toBe(
      'invalid',
    );
  });
});

describe('layoutScopeOf', () => {
  it('scopes the pages a client keeps for itself to the client', () => {
    expect(layoutScopeOf(CLIENT_PREFS.cameras.storageKey)).toBe('client');
    expect(layoutScopeOf(CLIENT_PREFS.call_audio.storageKey)).toBe('client');
  });

  it('scopes every other page to the profile', () => {
    expect(layoutScopeOf(CLIENT_PREFS.appearance.storageKey)).toBe('profile');
    expect(layoutScopeOf('some-board-page')).toBe('profile');
  });
});
