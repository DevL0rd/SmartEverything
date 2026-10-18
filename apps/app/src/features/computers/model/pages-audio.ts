import type { DevicePageContribution } from '../../../app-shell/device-pages';

export const AUDIO_PAGES: readonly DevicePageContribution[] = [
  {
    id: 'audio',
    title: 'Audio',
    subtitle: 'Volume, speakers, microphone and apps',
    icon: 'speaker',
    keywords: [
      'audio',
      'sound',
      'volume',
      'speakers',
      'headphones',
      'microphone',
      'mute',
      'app volume',
      'output',
      'input',
    ],
    settings: [
      'All sound',
      'Output',
      'Input',
      'App volume',
      'Set as default',
      'Mute microphone',
      'Output for an app',
      'Allow over 100 %',
    ],
  },
];
