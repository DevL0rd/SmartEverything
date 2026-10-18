import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_OVERLAY_PREFS } from '@smarteverything/domain';
import type { SettingEnv } from '../../../settings/types';

vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn().mockResolvedValue(undefined) },
}));
vi.mock('./overlay-native', () => ({
  overlayStatus: (): null => null,
  openOverlaySettings: vi.fn(),
  openAssistantSettings: vi.fn(),
}));

const { OVERLAY_CHOICES, OVERLAY_SETTINGS, OVERLAY_SWITCHES, choiceValue, setOverlayPref } =
  await import('./overlay-settings');
const { localPref } = await import('../../../store/local-prefs');

const AVAILABILITY: SettingEnv['availability'] = {
  hasDevices: false,
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

const env = (platform: SettingEnv['platform']): SettingEnv => ({
  owner: true,
  platform,
  availability: AVAILABILITY,
});

const idsFor = (platform: SettingEnv['platform']): readonly string[] =>
  OVERLAY_SETTINGS.filter((setting) => setting.visible?.(env(platform)) ?? true).map(
    (setting) => setting.id,
  );

describe('overlay settings', () => {
  it('start from the documented defaults', () => {
    expect(localPref('overlay')).toEqual(DEFAULT_OVERLAY_PREFS);
    expect(DEFAULT_OVERLAY_PREFS).toEqual({
      enabled: true,
      position: 'centre',
      glow: true,
      captions: true,
      display: 'active',
      whileSharing: 'small',
    });
  });

  it('write one field and leave the others', () => {
    setOverlayPref('captions', false);
    setOverlayPref('position', 'left');
    expect(localPref('overlay')).toEqual({
      ...DEFAULT_OVERLAY_PREFS,
      captions: false,
      position: 'left',
    });
    setOverlayPref('captions', true);
    setOverlayPref('position', 'centre');
    expect(localPref('overlay')).toEqual(DEFAULT_OVERLAY_PREFS);
  });

  it('accept only values the contract allows', () => {
    expect(choiceValue('position', 'right')).toBe('right');
    expect(choiceValue('whileSharing', 'hide')).toBe('hide');
    expect(choiceValue('position', 'top')).toBeNull();
    expect(choiceValue('display', 'everywhere')).toBeNull();
  });

  it('offer every choice the contract has, with a label for each', () => {
    for (const choice of OVERLAY_CHOICES) {
      const values = choice.options.map((option) => option.value);
      for (const value of values) {
        expect(choiceValue(choice.key, value), `${choice.key}:${value}`).toBe(value);
      }
      expect(new Set(values).size).toBe(values.length);
    }
  });

  it('show the desktop rows on desktop, the permission row on Android, and nothing on web', () => {
    expect(idsFor('desktop')).toEqual([
      'assistant.overlay',
      'assistant.overlay-glow',
      'assistant.overlay-captions',
      'assistant.overlay-position',
      'assistant.overlay-display',
      'assistant.overlay-sharing',
      'assistant.talk-shortcut',
      'assistant.mute-shortcut',
    ]);
    expect(idsFor('android')).toEqual([
      'assistant.overlay',
      'assistant.overlay-glow',
      'assistant.overlay-captions',
      'assistant.overlay-position',
      'assistant.overlay-permission',
    ]);
    expect(idsFor('web')).toEqual([]);
  });

  it('can be found by their search words', () => {
    const words = new Set(OVERLAY_SETTINGS.flatMap((setting) => setting.keywords));
    for (const word of ['overlay', 'glow', 'captions', 'shortcut', 'floating', 'subtitles']) {
      expect(words.has(word), word).toBe(true);
    }
    expect(OVERLAY_SWITCHES.map((spec) => spec.key)).toEqual(['enabled', 'glow', 'captions']);
  });

  it('are device-local custom rows', () => {
    for (const setting of OVERLAY_SETTINGS) {
      expect(setting.scope).toBe('device-local');
      expect(setting.control).toBe('custom');
    }
  });
});
