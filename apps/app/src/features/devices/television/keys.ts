import type { TvKey } from '@smarteverything/domain';

export const REPEATING_KEYS: ReadonlySet<TvKey> = new Set([
  'vol_up',
  'vol_down',
  'ch_up',
  'ch_down',
  'up',
  'down',
  'left',
  'right',
]);

export const DIGIT_KEYS: readonly TvKey[] = [
  'n0',
  'n1',
  'n2',
  'n3',
  'n4',
  'n5',
  'n6',
  'n7',
  'n8',
  'n9',
];

export const SHOWN_KEYS: readonly TvKey[] = [
  'power',
  'up',
  'down',
  'left',
  'right',
  'ok',
  'back',
  'home',
  'menu',
  'source',
  'guide',
  'info',
  'settings',
  'vol_up',
  'vol_down',
  'mute',
  'ch_up',
  'ch_down',
  'play_pause',
  'rewind',
  'ff',
  'prev_track',
  'next_track',
  'red',
  'green',
  'yellow',
  'blue',
  ...DIGIT_KEYS,
];

export const MAX_CHANNEL_DIGITS = 4;
