import type { IconName } from '../../../components/icon';
import { IR_CATEGORIES, type IrCategory } from '../../device-visuals';
import { roleOf } from '@smarteverything/domain';

export const REMOTE_CATEGORIES = IR_CATEGORIES;

export type RemoteCategory = IrCategory;

interface CategoryLook {
  readonly label: string;
  readonly icon: IconName;
  readonly stored: string;
}

export const CATEGORY_LOOKS: Readonly<Record<RemoteCategory, CategoryLook>> = {
  ac: { label: 'Air conditioner', icon: 'snowflake', stored: 'air conditioner' },
  fan: { label: 'Fan', icon: 'fan', stored: 'fan' },
  light: { label: 'Light', icon: 'bulb', stored: 'light' },
  speaker: { label: 'Speaker', icon: 'speaker', stored: 'audio' },
  projector: { label: 'Projector', icon: 'tv', stored: 'projector' },
  settop: { label: 'Set-top box', icon: 'remote', stored: 'set-top box' },
  tv: { label: 'TV', icon: 'tv', stored: 'tv' },
  other: { label: 'Other', icon: 'remote', stored: 'other' },
};

export function categoryOfLearned(stored: string): RemoteCategory {
  const wanted = stored.trim().toLowerCase();
  return (
    REMOTE_CATEGORIES.find((category) => CATEGORY_LOOKS[category].stored === wanted) ?? 'other'
  );
}

const NAME_WORDS: readonly (readonly [RemoteCategory, RegExp])[] = [
  ['ac', /\b(a\/?c|aircon|air ?conditioner|heat pump)\b/i],
  ['fan', /\bfan\b/i],
  ['light', /\b(light|lamp)\b/i],
  ['speaker', /\b(speaker|amp|amplifier|soundbar|audio|stereo)\b/i],
  ['projector', /projector/i],
  ['settop', /(set.?top|cable|receiver|streamer|apple tv|roku)/i],
  ['tv', /\b(tv|television)\b/i],
];

export function categoryOfLibrary(name: string, keys: readonly string[]): RemoteCategory {
  const named = NAME_WORDS.find(([, words]) => words.test(name));
  if (named !== undefined) {
    return named[0];
  }
  const roles = new Set(keys.map(roleOf));
  if (roles.has('temp_up') || roles.has('temp_down')) {
    return 'ac';
  }
  if (roles.has('vol_up') || roles.has('vol_down')) {
    return 'tv';
  }
  if (roles.has('speed_up') || roles.has('speed_cycle') || roles.has('oscillate')) {
    return 'fan';
  }
  return 'other';
}

export const SUGGESTED_BUTTONS: Readonly<Record<RemoteCategory, readonly string[]>> = {
  ac: ['Power', 'Temp up', 'Temp down', 'Mode', 'Swing'],
  fan: ['Power', 'Speed up', 'Speed down', 'Oscillate'],
  light: ['Power', 'Brighter', 'Dimmer'],
  speaker: ['Power', 'Vol up', 'Vol down', 'Mute', 'Input'],
  projector: ['Power', 'Input', 'Menu'],
  settop: ['Power', 'Play pause', 'Menu'],
  tv: ['Power', 'Vol up', 'Vol down', 'Mute', 'Input'],
  other: ['Power'],
};

export function missingSuggestions(
  category: RemoteCategory,
  learned: readonly string[],
): readonly string[] {
  const have = new Set(learned.map((name) => name.trim().toLowerCase()));
  return SUGGESTED_BUTTONS[category].filter((name) => !have.has(name.toLowerCase()));
}
