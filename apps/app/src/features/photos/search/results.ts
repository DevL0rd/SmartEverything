import { photoFlags, type DriveItem, type PhotoFlag } from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { bytes, count } from '../../../format/number';
import { duration, MINUTE_MS } from '../../../format/time';

type MediaItem = Extract<DriveItem, { kind: 'image' | 'video' }>;

const TURNED = new Set([5, 6, 7, 8]);

export function isMediaItem(item: DriveItem): item is MediaItem {
  return item.kind === 'image' || item.kind === 'video';
}

function aspectOf(item: MediaItem): number {
  if (item.width === null || item.height === null) return 1;
  const turned = item.orientation !== null && TURNED.has(item.orientation);
  return turned ? item.height / item.width : item.width / item.height;
}

export function offsetMinOf(moment: string): number | null {
  if (moment.endsWith('Z')) return 0;
  const zone = /([+-])(\d{2}):(\d{2})$/.exec(moment);
  if (zone === null) return null;
  const sign = zone[1] === '-' ? -1 : 1;
  return sign * (Number(zone[2]) * 60 + Number(zone[3]));
}

function flagsOf(item: MediaItem): number {
  const flags: PhotoFlag[] = [];
  if (item.starred) flags.push('favourite');
  if (item.kind === 'video') flags.push('video');
  if (item.thumb.state === 'none') flags.push('processing');
  if (item.thumb.state === 'failed' || item.thumb.state === 'unsupported') {
    flags.push('unreadable');
  }
  return photoFlags(flags);
}

export function tileOfItem(item: MediaItem): MediaTile {
  const moment = item.takenAt ?? item.modifiedAt;
  return {
    id: item.id,
    rev: item.rev,
    aspect: aspectOf(item),
    takenAt: Date.parse(moment),
    offsetMin: offsetMinOf(moment),
    durationMs: item.kind === 'video' ? item.durationMs : null,
    thumbhash: null,
    flags: flagsOf(item),
    local: false,
  };
}

export function tilesOfItems(items: readonly DriveItem[]): readonly MediaTile[] {
  return items.filter(isMediaItem).map(tileOfItem);
}

export interface ResultSummary {
  readonly photos: number;
  readonly videos: number;
  readonly bytes: number;
  readonly durationMs: number;
  readonly complete: boolean;
}

export function resultSummaryOf(items: readonly DriveItem[], complete: boolean): ResultSummary {
  const media = items.filter(isMediaItem);
  return {
    photos: media.filter((item) => item.kind === 'image').length,
    videos: media.filter((item) => item.kind === 'video').length,
    bytes: media.reduce((sum, item) => sum + item.bytes, 0),
    durationMs: media.reduce(
      (sum, item) => sum + (item.kind === 'video' ? (item.durationMs ?? 0) : 0),
      0,
    ),
    complete,
  };
}

function nounOf(summary: ResultSummary): string {
  const total = summary.photos + summary.videos;
  if (summary.photos === 0) return total === 1 ? 'video' : 'videos';
  if (summary.videos === 0) return total === 1 ? 'photo' : 'photos';
  return 'photos and videos';
}

export function resultCountText(summary: ResultSummary): string {
  const total = count(summary.photos + summary.videos);
  return `${summary.complete ? total : `${total}+`} ${nounOf(summary)}`;
}

export function resultMetaText(summary: ResultSummary): string {
  const minutes = Math.round(summary.durationMs / MINUTE_MS);
  const length = minutes === 0 ? null : duration(minutes * 60);
  return [length, bytes(summary.bytes)].filter((part) => part !== null).join(' · ');
}
