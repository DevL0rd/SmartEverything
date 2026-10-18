import { describe, expect, it } from 'vitest';
import type { SettingEnv } from '../../settings/types';
import { SETTINGS } from './settings';

const AVAILABILITY: SettingEnv['availability'] = {
  hasDevices: true,
  hasClimate: false,
  hasCameras: true,
  hasHealth: false,
  hasScenes: false,
  hasEnergy: false,
  hasSecurity: false,
  hasIr: false,
  hasWatch: false,
  needsAttention: false,
};

const env = (owner: boolean, hasCameras: boolean): SettingEnv => ({
  owner,
  platform: 'android',
  availability: { ...AVAILABILITY, hasCameras },
});

const transcriptRows = SETTINGS.filter((setting) => setting.id.startsWith('cameras.transcripts.'));

describe('camera settings', () => {
  it('keep transcript retention and the daily transcribing budget on the camera page', () => {
    expect(transcriptRows.map((setting) => [setting.id, setting.page, setting.scope])).toEqual([
      ['cameras.transcripts.retention', 'cameras', 'server'],
      ['cameras.transcripts.budget', 'cameras', 'server'],
    ]);
  });

  it('show transcript retention and budget to owners of a home with cameras only', () => {
    const shown = (owner: boolean, hasCameras: boolean): boolean[] =>
      transcriptRows.map((setting) => setting.visible?.(env(owner, hasCameras)) ?? true);
    expect(shown(true, true)).toEqual([true, true]);
    expect(shown(false, true)).toEqual([false, false]);
    expect(shown(true, false)).toEqual([false, false]);
  });
});
