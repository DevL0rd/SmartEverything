export type RemoteLayout = 'tile' | 'compact' | 'card' | 'tall' | 'wide';

export interface LayoutFrame {
  readonly width: number;
  readonly height: number;
}

const TILE_BELOW_WIDTH = 200;
const WIDE_FROM_WIDTH = 560;
const WIDE_BELOW_HEIGHT = 200;
const TALL_FROM = 288;
const CARD_FROM = 176;
const CHIPS_FROM = 160;
const RING_FROM_WIDTH = 300;
const RING_AND_GAP = 106;
const PLAY_FROM = 220;
const MUTE_FROM = 170;

export function remoteLayoutOf({ width, height }: LayoutFrame): RemoteLayout {
  if (width < TILE_BELOW_WIDTH) {
    return 'tile';
  }
  if (width >= WIDE_FROM_WIDTH && height < WIDE_BELOW_HEIGHT) {
    return 'wide';
  }
  if (height >= TALL_FROM) {
    return 'tall';
  }
  return height >= CARD_FROM ? 'card' : 'compact';
}

export interface CompactParts {
  readonly ring: boolean;
  readonly mute: boolean;
  readonly play: boolean;
  readonly chips: boolean;
}

export function compactPartsOf({ width, height }: LayoutFrame): CompactParts {
  const ring = width >= RING_FROM_WIDTH;
  const room = width - (ring ? RING_AND_GAP : 0);
  return { ring, mute: room >= MUTE_FROM, play: room >= PLAY_FROM, chips: height >= CHIPS_FROM };
}
