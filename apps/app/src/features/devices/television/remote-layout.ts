import type { WideClass } from '../card/wide-card';

export type RemoteLayout = 'compact' | 'tall' | 'wide';

const LAYOUTS: Readonly<Record<WideClass, RemoteLayout>> = {
  m: 'compact',
  w: 'wide',
  l: 'tall',
  xl: 'tall',
};

const ROUND_KEY = 48;
const HORIZONTAL_ROCKER = 128;
const AUDIO_KEY_GAP = 6;
const TITLE_AND_APPS_RAIL = 188;
const WIDE_RAIL_GAP = 16;
const POWER_KEY = ROUND_KEY;
const CARD_RING = 96;
const RING_GAP = 10;
const REMOTE_KEY_GAP = 8;
const CARD_EDGES = 2;
const AUDIO_STEP = AUDIO_KEY_GAP + ROUND_KEY;
const RING_AND_GAP = CARD_RING + RING_GAP;
const MUTE_FROM = HORIZONTAL_ROCKER + AUDIO_STEP;
const PLAY_FROM = MUTE_FROM + AUDIO_STEP;
const PLAY_PAIR_FROM = PLAY_FROM + AUDIO_STEP;
const RING_FROM_WIDTH = RING_AND_GAP + MUTE_FROM;

export function remoteLayoutOf(cls: WideClass): RemoteLayout {
  return LAYOUTS[cls];
}

export function tallRingSize(width: number): 'card' | 'quick' {
  const controlRow = HORIZONTAL_ROCKER + 3 * AUDIO_STEP + AUDIO_KEY_GAP + POWER_KEY;
  return width - CARD_EDGES < controlRow ? 'card' : 'quick';
}

export function stackWideControls(width: number): boolean {
  const widestControlRow = HORIZONTAL_ROCKER + 5 * ROUND_KEY + CARD_RING + 6 * REMOTE_KEY_GAP;
  return width < TITLE_AND_APPS_RAIL + widestControlRow + POWER_KEY + 2 * WIDE_RAIL_GAP;
}

export interface CompactParts {
  readonly ring: boolean;
  readonly mute: boolean;
  readonly play: boolean;
  readonly playPair: boolean;
}

export function compactPartsOf(width: number, ringAvailable: boolean): CompactParts {
  const ring = ringAvailable && width >= RING_FROM_WIDTH;
  const room = width - (ring ? RING_AND_GAP : 0);
  return {
    ring,
    mute: room >= MUTE_FROM,
    play: room >= PLAY_FROM,
    playPair: room >= PLAY_PAIR_FROM,
  };
}
