import { describe, expect, it, vi } from 'vitest';
import type { Availability } from '../../store/selectors';
import { DEVELOPER_PAGES } from '../../settings/tree-developer';
import type { SettingEnv } from '../../settings/types';
import { SETTINGS } from './settings';

vi.mock('../../settings/registry', () => ({ settingPageOf: (): undefined => undefined }));

vi.mock('../../components/rows', () => ({
  ActionRow: (): null => null,
  SelectRow: (): null => null,
  SwitchRow: (): null => null,
}));

vi.mock('./components/watch-capture-rows', () => ({ WatchCaptureClearRow: (): null => null }));
vi.mock('./components/ai-repair-inbox', () => ({ AiRepairInbox: (): null => null }));

const AVAILABILITY: Availability = {
  hasDevices: true,
  hasClimate: false,
  hasCameras: false,
  hasHealth: false,
  hasScenes: false,
  hasEnergy: false,
  hasSecurity: false,
  hasIr: false,
  hasWatch: false,
  needsAttention: false,
};

const onAndroid: SettingEnv = {
  owner: true,
  platform: 'android',
  developer: true,
  availability: AVAILABILITY,
};

const shown = (env: SettingEnv): readonly string[] =>
  SETTINGS.filter((setting) => setting.visible?.(env) ?? true).map((setting) => setting.id);

describe('developer settings', () => {
  it('lets the owner pause AI repair even when device diagnostics are off', () => {
    expect(shown(onAndroid)).toContain('developer.mode');
    expect(shown({ ...onAndroid, developer: false })).toEqual([
      'developer.mode',
      'developer.ai-repair',
      'developer.error-investigations',
      'developer.error-investigations.clear-inactive',
      'developer.error-investigations.dismiss-group',
    ]);
    expect(shown({ ...onAndroid, owner: false })).toEqual([]);
  });

  it('finds dismissal actions through the Error investigations inbox', () => {
    for (const id of ['clear-inactive', 'dismiss-group']) {
      const setting = SETTINGS.find((entry) => entry.id === `developer.error-investigations.${id}`);
      expect(setting).toMatchObject({
        control: 'listed',
        in: 'developer.error-investigations',
      });
    }
  });

  it('hides Developer and all of its subpages from members', () => {
    for (const page of DEVELOPER_PAGES) {
      expect(page.visible?.(onAndroid)).toBe(true);
      expect(page.visible?.({ ...onAndroid, owner: false })).toBe(false);
    }
  });

  it('offers log sharing detail only to the owner in developer mode', () => {
    expect(shown(onAndroid)).toContain('developer.log-sharing');
    expect(shown({ ...onAndroid, developer: false })).not.toContain('developer.log-sharing');
    expect(shown({ ...onAndroid, owner: false })).not.toContain('developer.log-sharing');
    expect(shown({ ...onAndroid, availability: { ...AVAILABILITY, hasDevices: false } })).toEqual(
      shown(onAndroid),
    );
  });

  it('keeps one device log control alongside profiling options', () => {
    const ids = shown(onAndroid);
    expect(ids).toContain('developer.perf.sampling');
    expect(ids).toContain('developer.perf.lists');
    expect(ids.filter((id) => id.startsWith('developer.log-level'))).toEqual([
      'developer.log-level',
    ]);
  });

  it('keeps the watch rows on the phone and hides them elsewhere', () => {
    for (const id of ['developer.watch.capture', 'developer.watch-captures.clear']) {
      expect(shown(onAndroid)).toContain(id);
      expect(shown({ ...onAndroid, platform: 'desktop' })).not.toContain(id);
      expect(shown({ ...onAndroid, platform: 'web' })).not.toContain(id);
    }
  });
});
