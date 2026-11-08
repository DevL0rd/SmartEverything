import { photoFlags, type DriveItem, type PhotoFlag } from '@smarteverything/domain';
import type { MediaTile } from '../../../components/media-grid/tiles';
import { bytes as bytesText } from '../../../format/number';
import { dayRange, plural } from './model';

type MediaItem = Extract<DriveItem, { readonly kind: 'image' | 'video' }>;

const OFFSET = /([+-])(\d{2}):(\d{2})$/;

export function isMedia(item: DriveItem): item is MediaItem {
  return item.kind === 'image' || item.kind === 'video';
}

export function offsetOf(moment: string): number | null {
  if (moment.endsWith('Z')) return 0;
  const match = OFFSET.exec(moment);
  if (match === null) return null;
  const minutes = Number(match[2]) * 60 + Number(match[3]);
  return match[1] === '-' ? -minutes : minutes;
}

function aspectOf(item: MediaItem): number {
  if (item.width === null || item.height === null) return 1;
  const turned = item.orientation !== null && item.orientation >= 5;
  return turned ? item.height / item.width : item.width / item.height;
}

function flagsOf(item: MediaItem): number {
  const flags: PhotoFlag[] = [];
  if (item.starred) flags.push('favourite');
  if (item.kind === 'video') flags.push('video');
  if (item.thumb.state === 'none') flags.push('processing');
  if (item.thumb.state === 'failed' || item.thumb.state === 'unsupported') flags.push('unreadable');
  return photoFlags(flags);
}

export function tileOfItem(item: MediaItem): MediaTile {
  const moment = item.takenAt ?? item.modifiedAt;
  return {
    id: item.id,
    rev: item.rev,
    aspect: aspectOf(item),
    takenAt: Date.parse(moment),
    offsetMin: offsetOf(moment),
    durationMs: item.kind === 'video' ? item.durationMs : null,
    thumbhash: null,
    flags: flagsOf(item),
    local: false,
  };
}

export function tilesOfItems(items: readonly DriveItem[]): readonly MediaTile[] {
  return items.filter(isMedia).map(tileOfItem);
}

export interface AlbumStats {
  readonly split: string;
  readonly span: string | null;
  readonly size: string;
}

function wallDay(moment: string): string {
  return moment.slice(0, 10);
}

export function spanOf(items: readonly DriveItem[]): string | null {
  const days = items
    .filter(isMedia)
    .map((item) => wallDay(item.takenAt ?? item.modifiedAt))
    .sort();
  const first = days[0];
  const last = days.at(-1);
  return first === undefined || last === undefined ? null : dayRange(first, last);
}

export function statsOf(items: readonly DriveItem[]): AlbumStats {
  const media = items.filter(isMedia);
  const videos = media.filter((item) => item.kind === 'video').length;
  const photos = media.length - videos;
  return {
    split: `${plural(photos, 'photo', 'photos')} · ${plural(videos, 'video', 'videos')}`,
    span: spanOf(items),
    size: bytesText(media.reduce((sum, item) => sum + item.bytes, 0)),
  };
}

export function mosaicOf(
  coverItemId: string | null,
  items: readonly DriveItem[],
): readonly string[] {
  const ids = items.filter(isMedia).map((item) => item.id);
  const lead = coverItemId ?? ids[0];
  if (lead === undefined) return [];
  return [lead, ...ids.filter((id) => id !== lead)].slice(0, 3);
}
