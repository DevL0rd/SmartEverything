import type { NetworkClient } from '@smarteverything/domain';
import type { IconName } from '../../../components/icon-glyphs';

const NAME_HINTS: readonly (readonly [IconName, readonly string[]])[] = [
  ['tv', ['tv', 'television', 'roku', 'chromecast', 'bravia', 'fire stick', 'firestick']],
  ['gamepad', ['switch', 'playstation', 'ps4', 'ps5', 'xbox', 'nintendo', 'steam deck', 'console']],
  ['speaker', ['speaker', 'echo', 'sonos', 'homepod', 'soundbar', 'alexa', 'google home']],
  ['camera', ['camera', 'cam', 'doorbell']],
  [
    'monitor',
    [
      'laptop',
      'macbook',
      'notebook',
      'desktop',
      'pc',
      'imac',
      'mac mini',
      'workstation',
      'printer',
    ],
  ],
];

const HINT_PATTERNS: readonly (readonly [IconName, RegExp])[] = NAME_HINTS.map(
  ([icon, words]) => [icon, new RegExp(`\\b(${words.join('|')})`, 'i')] as const,
);

export function clientGlyph(client: Pick<NetworkClient, 'name' | 'connection'>): IconName {
  const hinted = HINT_PATTERNS.find(([, pattern]) => pattern.test(client.name));
  if (hinted !== undefined) {
    return hinted[0];
  }
  return client.connection === 'wired' ? 'monitor' : 'smartphone';
}
