import { z } from 'zod';
import type { ChatWidget, Memory } from '@smarteverything/domain';
import type { AppHref } from '../../../components/app-href';
import type { IconName } from '../../../components/icon';
import type { MediaTile } from '../../../components/media-grid/tiles';

export type PhotosChatWidget = Extract<ChatWidget, { kind: 'photos' }>;

export const STRIP_GAP = 3;
export const TILE_MIN = 96;
export const STRIP_HEIGHT = 70;
export const SINGLE_HEIGHT = 200;

export const PHOTOS_WIDGET_COPY = {
  photo: 'Photo',
  video: 'Video',
  openPhotos: 'Open in Photos',
  openAlbum: 'Open album',
  play: 'Play memory',
  gone: 'It was removed or is not shared with you.',
  notMedia: 'That file is not a photo or video.',
  noMonth: 'There are no photos from that month.',
  offline: 'Hub offline',
  waiting: 'The photos show here once the hub is back.',
  failed: 'Can’t show these photos',
  retry: 'Try again',
} as const;

const WIDGET_ID: Readonly<Record<PhotosChatWidget['view'], z.ZodType<string>>> = {
  item: z.uuid(),
  album: z.string(),
  memory: z.string(),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
};

export type StripAction =
  | { readonly kind: 'link'; readonly label: string; readonly href: AppHref }
  | { readonly kind: 'play'; readonly label: string; readonly memory: Memory };

export interface ReadyStrip {
  readonly status: 'ready';
  readonly icon: IconName;
  readonly title: string;
  readonly trail: string;
  readonly tiles: readonly MediaTile[];
  readonly total: number;
  readonly action: StripAction;
  readonly opens: Readonly<Record<string, string>>;
}

export type Strip =
  | { readonly status: 'loading' }
  | { readonly status: 'error'; readonly error: unknown; readonly retry: () => void }
  | { readonly status: 'missing'; readonly reason: string }
  | ReadyStrip;

export interface StripLayout {
  readonly cells: readonly { readonly tile: MediaTile; readonly width: number }[];
  readonly rest: number;
  readonly restWidth: number;
  readonly height: number;
}

const NOTHING: StripLayout = { cells: [], rest: 0, restWidth: 0, height: STRIP_HEIGHT };

function justified(width: number, shown: readonly MediaTile[], rest: number): StripLayout {
  const weights = shown.reduce((sum, tile) => sum + tile.aspect, rest > 0 ? 1 : 0);
  const cellCount = shown.length + (rest > 0 ? 1 : 0);
  const unit = (width - STRIP_GAP * (cellCount - 1)) / weights;
  return {
    cells: shown.map((tile) => ({ tile, width: tile.aspect * unit })),
    rest,
    restWidth: rest > 0 ? unit : 0,
    height: STRIP_HEIGHT,
  };
}

export function stripLayout(
  width: number,
  tiles: readonly MediaTile[],
  total: number,
): StripLayout {
  const first = tiles[0];
  if (width <= 0 || first === undefined) return NOTHING;
  if (total === 1) {
    const single = Math.min(width, SINGLE_HEIGHT * first.aspect);
    return { ...NOTHING, cells: [{ tile: first, width: single }], height: SINGLE_HEIGHT };
  }
  const columns = Math.max(1, Math.floor((width + STRIP_GAP) / (TILE_MIN + STRIP_GAP)));
  const slots = total > columns && columns > 1 ? columns - 1 : columns;
  const shown = tiles.slice(0, slots);
  const rest = Math.max(0, total - shown.length);
  return justified(width, shown, shown.length < columns ? rest : 0);
}

export function validPhotosWidget(widget: PhotosChatWidget): boolean {
  return WIDGET_ID[widget.view].safeParse(widget.id).success;
}
