import { expect, it, vi } from 'vitest';

vi.mock('@react-native-async-storage/async-storage', () => ({ default: {} }));
vi.mock('./browser-metadata', () => ({
  loadBrowserMetadata: (): Promise<void> => Promise.resolve(),
}));

const { migrateStoredPrefs } = await import('./local-prefs');

const PENDING = '7d0a2f6e-56a4-4c1b-9d43-0e7b3b7f1c11';

it('moves the stored app update prefs from the unused failed id to the launched id once, keeping the update being launched', () => {
  const stored = {
    sidebarCollapsed: true,
    appUpdates: { channel: 'release', failedId: PENDING, pendingId: PENDING },
  };
  const first = migrateStoredPrefs(stored);
  expect(first).toEqual({
    changed: true,
    value: {
      sidebarCollapsed: true,
      appUpdates: { channel: 'release', launchedId: PENDING, pendingId: PENDING },
    },
  });
  expect(migrateStoredPrefs(first.value)).toEqual({ value: first.value, changed: false });
});
