import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as MetadataModule from './browser-metadata';
import type * as PrefsModule from './local-prefs';

const disk = vi.hoisted((): { items: Map<string, string> } => ({ items: new Map() }));

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string): Promise<string | null> => Promise.resolve(disk.items.get(key) ?? null),
    setItem: (key: string, value: string): Promise<void> => {
      disk.items.set(key, value);
      return Promise.resolve();
    },
  },
}));
vi.mock('../design/platform', () => ({ isNative: (): boolean => false }));

const TABS_KEY = 'smarteverything.browser-tabs';
const PREFS_KEY = 'smarteverything.local-prefs';

async function load(): Promise<{
  readonly metadata: typeof MetadataModule;
  readonly prefs: typeof PrefsModule;
}> {
  vi.resetModules();
  return {
    metadata: await import('./browser-metadata'),
    prefs: await import('./local-prefs'),
  };
}

describe('saved browser tabs', () => {
  beforeEach(() => {
    disk.items.clear();
  });

  it('starts empty and keeps preferences when the saved tabs are unreadable', async () => {
    disk.items.set(TABS_KEY, '{not json');
    disk.items.set(PREFS_KEY, JSON.stringify({ sidebarCollapsed: true }));
    const { metadata, prefs } = await load();
    await prefs.loadLocalPrefs();
    expect(metadata.browserMetadata('anything')).toBeUndefined();
    expect(prefs.localPref('sidebarCollapsed')).toBe(true);
  });

  it('loads preferences that still carry the old inline tabs key', async () => {
    disk.items.set(PREFS_KEY, JSON.stringify({ lastFitnessTab: 'body', browserTabs: { a: 1 } }));
    const { prefs } = await load();
    await prefs.loadLocalPrefs();
    expect(prefs.localPref('lastFitnessTab')).toBe('body');
  });

  it('forgets every saved tab list that matches', async () => {
    const { metadata } = await load();
    metadata.setBrowserMetadata('keep', { n: 1 });
    metadata.setBrowserMetadata('drop-1', { n: 2 });
    metadata.setBrowserMetadata('drop-2', { n: 3 });
    metadata.forgetBrowserMetadataWhere((key) => key.startsWith('drop'));
    await vi.waitFor(() => {
      expect(JSON.parse(disk.items.get(TABS_KEY) ?? '{}')).toEqual({ keep: { n: 1 } });
    });
    expect(metadata.browserMetadata('drop-1')).toBeUndefined();
  });
});
