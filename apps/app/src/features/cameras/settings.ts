import { href } from '../../app-shell/hrefs';
import type { SettingDefinition } from '../../settings/types';

const hasCameras = (env: { readonly availability: { readonly hasCameras: boolean } }): boolean =>
  env.availability.hasCameras;

export const SETTINGS: readonly SettingDefinition[] = [
  {
    id: 'cameras.list',
    page: 'cameras',
    title: 'Camera options',
    description: 'Event clips, night vision, detection, privacy and memory card',
    keywords: [
      'save event clips',
      'recording',
      'night vision',
      'privacy',
      'motion',
      'memory card',
      'format',
      'restart',
    ],
    scope: 'device',
    control: 'link',
    href: href.settings.cameras(),
    visible: hasCameras,
  },
  {
    id: 'cameras.remote-viewing',
    page: 'cameras/remote-viewing',
    title: 'How to watch when away',
    description: 'Direct or through your server',
    keywords: ['away', 'relay', 'through your server', 'stun', 'turn', 'ice', 'webrtc'],
    scope: 'client',
    control: 'link',
    href: href.settings.remoteViewing(),
    visible: hasCameras,
  },
];
