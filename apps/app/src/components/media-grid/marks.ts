import { hasPhotoFlag } from '@smarteverything/domain';
import { playTime } from '../../format/time';
import type { MediaTile } from './tiles';

export type TileState = 'ready' | 'processing' | 'unreadable';

export interface TileMarks {
  readonly live: boolean;
  readonly stack: boolean;
  readonly favourite: boolean;
  readonly video: boolean;
  readonly duration: string | null;
  readonly local: boolean;
}

export const LOCAL_ONLY_LABEL = 'Only on this device';
export const UNREADABLE_LABEL = "Can't show this file";

export function tileState(tile: MediaTile): TileState {
  if (hasPhotoFlag(tile.flags, 'unreadable')) return 'unreadable';
  return hasPhotoFlag(tile.flags, 'processing') ? 'processing' : 'ready';
}

export function tileMarks(tile: MediaTile): TileMarks | null {
  if (tileState(tile) !== 'ready') return null;
  const video = hasPhotoFlag(tile.flags, 'video');
  return {
    live: hasPhotoFlag(tile.flags, 'live'),
    stack: hasPhotoFlag(tile.flags, 'stack'),
    favourite: hasPhotoFlag(tile.flags, 'favourite'),
    video,
    duration: video && tile.durationMs !== null ? playTime(tile.durationMs / 1000) : null,
    local: tile.local && tile.backedUp !== true,
  };
}

export function hasMarks(marks: TileMarks): boolean {
  return marks.live || marks.stack || marks.favourite || marks.video || marks.local;
}

function kindLabel(tile: MediaTile, marks: TileMarks | null): string {
  if (hasPhotoFlag(tile.flags, 'video')) return 'Video';
  return marks?.live === true ? 'Live photo' : 'Photo';
}

function stateLabel(state: TileState): string | null {
  if (state === 'unreadable') return UNREADABLE_LABEL;
  return state === 'processing' ? 'Still processing' : null;
}

export function tileLabel(tile: MediaTile): string {
  const marks = tileMarks(tile);
  const parts = [
    kindLabel(tile, marks),
    marks?.duration ?? null,
    marks?.stack === true ? 'Stack' : null,
    marks?.favourite === true ? 'Favourite' : null,
    marks?.local === true ? LOCAL_ONLY_LABEL : null,
    stateLabel(tileState(tile)),
  ];
  return parts.filter((part): part is string => part !== null).join(', ');
}
