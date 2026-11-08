import { beforeEach, expect, it, vi } from 'vitest';

const saved = vi.hoisted(() => new Map<string, string>());

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string): Promise<string | null> => Promise.resolve(saved.get(key) ?? null),
    setItem: (key: string, value: string): Promise<void> => {
      saved.set(key, value);
      return Promise.resolve();
    },
  },
}));

const HOME = 'https://home-one.local';
const OUTCOME = JSON.stringify([
  'd589fc4f-9cce-4033-ae3f-b838a0694bc8',
  'done',
  '2026-11-06T00:01:00.000Z',
]);

beforeEach(() => {
  vi.resetModules();
  saved.clear();
});

it('restores the seen outcome after restarting from persistent device preferences', async () => {
  const firstPrefs = await import('../../../store/local-prefs');
  const first = await import('./release-notice');
  await firstPrefs.loadLocalPrefs();
  expect(first.releaseOutcomeSeen(HOME, OUTCOME)).toBe(false);
  first.rememberReleaseOutcome(HOME, OUTCOME);
  first.rememberReleaseOutcome(HOME, OUTCOME);
  expect(firstPrefs.localPref('hubUpdateNotices')).toEqual({ [HOME]: [OUTCOME] });

  vi.resetModules();
  const restartedPrefs = await import('../../../store/local-prefs');
  const restarted = await import('./release-notice');
  expect(restarted.releaseOutcomeSeen(HOME, OUTCOME)).toBe(false);
  await restartedPrefs.loadLocalPrefs();
  expect(restarted.releaseOutcomeSeen(HOME, OUTCOME)).toBe(true);
  expect(restarted.releaseOutcomeSeen('https://home-two.local', OUTCOME)).toBe(false);
  expect(restarted.releaseOutcomeSeen(HOME, `${OUTCOME}:another-outcome`)).toBe(false);
});

it('adds notice acknowledgement to existing preferences without resetting their values', async () => {
  saved.set('smarteverything.local-prefs', JSON.stringify({ sidebarCollapsed: true }));
  const prefs = await import('../../../store/local-prefs');
  const outcomes = await import('./release-notice');
  await prefs.loadLocalPrefs();
  expect(prefs.localPref('sidebarCollapsed')).toBe(true);
  expect(prefs.localPref('hubUpdateNotices')).toEqual({});
  outcomes.rememberReleaseOutcome(HOME, OUTCOME);

  vi.resetModules();
  const restarted = await import('../../../store/local-prefs');
  await restarted.loadLocalPrefs();
  expect(restarted.localPref('sidebarCollapsed')).toBe(true);
  expect(restarted.localPref('hubUpdateNotices')).toEqual({ [HOME]: [OUTCOME] });
});
