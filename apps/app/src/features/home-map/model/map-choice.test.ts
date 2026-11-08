import { HOME_MAP_SUMMARY, type HomeMapSummary } from '@smarteverything/domain';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const disk = vi.hoisted(() => new Map<string, string>());
const saves = vi.hoisted(() => ({ fail: false, attempts: 0 }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string): Promise<string | null> => Promise.resolve(disk.get(key) ?? null),
    setItem: (key: string, value: string): Promise<void> => {
      saves.attempts += 1;
      if (saves.fail) return Promise.reject(new Error('The disk is full'));
      disk.set(key, value);
      return Promise.resolve();
    },
  },
}));

const { rememberMapChoice, rememberedMapChoice, resolveMapChoice, withMapChoice } =
  await import('./map-choice');

const AT = '2026-10-25T11:00:00.000Z';
const STORAGE_KEY = 'smarteverything.home-map-choices';

const map = (id: string, position: number, isDefault = false): HomeMapSummary =>
  HOME_MAP_SUMMARY.parse({
    id,
    name: id,
    revision: 1,
    floorNames: [],
    roomCount: 0,
    isDefault,
    position,
    fedBy: [],
    hasScan: false,
    updatedAt: AT,
  });

const MAPS = [map('home', 0, true), map('studio', 1), map('cabin', 2)];

beforeEach(() => {
  saves.fail = false;
  saves.attempts = 0;
});

describe('which map a page shows', () => {
  it('shows the default map first when the page remembers nothing', () => {
    expect(resolveMapChoice(MAPS, undefined)?.id).toBe('home');
    expect(resolveMapChoice([map('studio', 1), map('cabin', 2, true)], undefined)?.id).toBe(
      'cabin',
    );
  });

  it('shows the map the page last showed, whatever the default is', () => {
    expect(resolveMapChoice(MAPS, 'cabin')?.id).toBe('cabin');
  });

  it('falls back to the default when the remembered map is gone', () => {
    expect(resolveMapChoice(MAPS, 'attic')?.id).toBe('home');
  });

  it('takes the first map by position when none is marked default', () => {
    expect(resolveMapChoice([map('cabin', 2), map('studio', 1)], undefined)?.id).toBe('studio');
  });

  it('has no map to show when there are no maps at all', () => {
    expect(resolveMapChoice([], 'home')).toBeNull();
  });
});

describe('remembering per page', () => {
  it('keeps one choice per page without touching the others', () => {
    const first = withMapChoice({}, 'home', 'cabin');
    const second = withMapChoice(first, 'devices', 'studio');
    expect(second).toStrictEqual({ home: 'cabin', devices: 'studio' });
    expect(first).toStrictEqual({ home: 'cabin' });
  });

  it('stores the choice on this device and reads it back after a restart', async () => {
    rememberMapChoice('vacuum', 'cabin');
    expect(rememberedMapChoice('vacuum')).toBe('cabin');
    expect(rememberedMapChoice('home')).toBeUndefined();
    await vi.waitFor(() => {
      expect(JSON.parse(disk.get(STORAGE_KEY) ?? '{}')).toStrictEqual({ vacuum: 'cabin' });
    });
  });

  it('keeps the choice in memory when it cannot be saved', async () => {
    saves.fail = true;
    rememberMapChoice('shelly', 'studio');
    expect(rememberedMapChoice('shelly')).toBe('studio');
    await vi.waitFor(() => {
      expect(saves.attempts).toBeGreaterThan(0);
    });
  });

  it('loads what was saved without overriding a choice made meanwhile', async () => {
    vi.resetModules();
    const fresh = await import('./map-choice');
    disk.set(STORAGE_KEY, JSON.stringify({ devices: 'studio', home: 'cabin' }));
    fresh.rememberMapChoice('home', 'studio');
    await fresh.loadMapChoices();
    expect(fresh.rememberedMapChoice('devices')).toBe('studio');
    expect(fresh.rememberedMapChoice('home')).toBe('studio');
    await vi.waitFor(() => {
      expect(JSON.parse(disk.get(STORAGE_KEY) ?? '{}')).toMatchObject({
        devices: 'studio',
        home: 'studio',
      });
    });
  });
});
