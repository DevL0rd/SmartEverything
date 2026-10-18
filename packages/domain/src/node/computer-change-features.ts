import type { AudioChange } from './computer-audio';
import type { DisplayChange } from './computer-displays';
import type { ComputerFeature } from './computer-features';

export function audioChangeFeature(change: AudioChange): ComputerFeature {
  switch (change.action) {
    case 'app_volume':
    case 'app_mute':
    case 'app_output':
      return 'audio_apps';
    case 'volume':
    case 'mute':
    case 'default':
      return change.kind === 'input' ? 'microphone' : 'audio';
  }
}

const DISPLAY_FEATURES: Readonly<Record<DisplayChange['action'], ComputerFeature>> = {
  enable: 'display_enable',
  disable: 'display_enable',
  mirror: 'display_enable',
  mode: 'display_modes',
  brightness: 'brightness',
  hdr: 'hdr',
  vrr: 'vrr',
  night_light: 'night_light',
  scale: 'displays',
  rotation: 'displays',
  primary: 'displays',
  position: 'displays',
  identify: 'displays',
};

export function displayChangeFeature(change: DisplayChange): ComputerFeature {
  return DISPLAY_FEATURES[change.action];
}
