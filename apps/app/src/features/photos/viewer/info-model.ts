import type { DriveItem, MediaTimeSource, PhotoPlace } from '@smarteverything/domain';
import { zonedDateFormat } from '../../../format/locale';
import { bytes, decimal, rounded } from '../../../format/number';
import { MINUTE_MS } from '../../../format/time';

export type MediaItem = Extract<DriveItem, { readonly kind: 'image' | 'video' }>;

type Camera = NonNullable<MediaItem['camera']>;
type Exposure = NonNullable<MediaItem['exposure']>;

const WALL_ZONE = 'UTC';

const FULL_TIME = zonedDateFormat({
  weekday: 'short',
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
});
const LONG_DAY = zonedDateFormat({
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const CLOCK = zonedDateFormat({ hour: '2-digit', minute: '2-digit' });
const ADDED_DAY = zonedDateFormat({ day: 'numeric', month: 'short', year: 'numeric' });

const RAW_EXTENSIONS: ReadonlySet<string> = new Set([
  'arw',
  'cr2',
  'cr3',
  'dng',
  'nef',
  'nrw',
  'orf',
  'pef',
  'raf',
  'rw2',
  'srw',
]);

const SHOWN_ORIGINALS: ReadonlySet<string> = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
]);

const SOURCE_TEXT: Readonly<Record<MediaTimeSource, string>> = {
  exif: 'From the camera',
  gps: 'From the GPS clock',
  file: 'From the file date',
};

export interface WallTime {
  readonly at: Date;
  readonly zone: string | null;
}

export function isMediaItem(item: DriveItem): item is MediaItem {
  return item.kind === 'image' || item.kind === 'video';
}

export function wallTimeOf(moment: string, offsetMin: number | null): WallTime {
  const at = Date.parse(moment);
  if (offsetMin === null) return { at: new Date(at), zone: null };
  return { at: new Date(at + offsetMin * MINUTE_MS), zone: WALL_ZONE };
}

function extensionOf(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot === -1 ? '' : name.slice(dot + 1).toLowerCase();
}

export function isRaw(item: MediaItem): boolean {
  return item.kind === 'image' && RAW_EXTENSIONS.has(extensionOf(item.name));
}

export function showsOriginal(item: MediaItem): boolean {
  return item.kind === 'image' && SHOWN_ORIGINALS.has(item.mime);
}

export function cameraLine(camera: Camera | null): string | null {
  return camera?.model ?? camera?.make ?? null;
}

export function apertureText(aperture: number): string {
  return `f/${rounded(aperture, 2)}`;
}

export function shutterText(seconds: number): string {
  if (seconds >= 1) return `${rounded(seconds, 1)} s`;
  return `1/${String(Math.round(1 / seconds))} s`;
}

function present(parts: readonly (string | null)[]): readonly string[] {
  return parts.filter((part) => part !== null);
}

function opticsOf(exposure: Exposure | null): string | null {
  if (exposure === null) return null;
  const optics = present([
    exposure.focal === null ? null : `${rounded(exposure.focal, 0)} mm`,
    exposure.aperture === null ? null : apertureText(exposure.aperture),
  ]);
  return optics.length === 0 ? null : optics.join(' ');
}

export function lensLine(camera: Camera | null, exposure: Exposure | null): string | null {
  const parts = present([camera?.lens ?? null, opticsOf(exposure)]);
  return parts.length === 0 ? null : parts.join(' · ');
}

export function exposureChips(exposure: Exposure | null): readonly string[] {
  if (exposure === null) return [];
  return present([
    exposure.iso === null ? null : `ISO ${rounded(exposure.iso, 0)}`,
    exposure.shutter === null ? null : shutterText(exposure.shutter),
    exposure.aperture === null ? null : apertureText(exposure.aperture),
  ]);
}

export function offsetText(offsetMin: number): string {
  const sign = offsetMin < 0 ? '−' : '+';
  const minutes = Math.abs(offsetMin);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return `UTC${sign}${String(hours)}${rest === 0 ? '' : `:${String(rest).padStart(2, '0')}`}`;
}

export function takenLine(time: WallTime): string {
  return FULL_TIME(time.zone).format(time.at);
}

export function takenSourceLine(
  source: MediaTimeSource | null,
  offsetMin: number | null,
): string | null {
  const parts = present([
    source === null ? null : SOURCE_TEXT[source],
    offsetMin === null ? null : offsetText(offsetMin),
  ]);
  return parts.length === 0 ? null : parts.join(' · ');
}

export function headerDayText(time: WallTime): string {
  return `${LONG_DAY(time.zone).format(time.at)} · ${CLOCK(time.zone).format(time.at)}`;
}

export function megapixels(width: number, height: number): string {
  return `${decimal((width * height) / 1_000_000, 1)} MP`;
}

export function typeLabel(item: MediaItem): string {
  if (isRaw(item)) return 'RAW';
  if (item.kind === 'video') return 'Video';
  const extension = extensionOf(item.name);
  return extension === '' ? 'Photo' : extension.toUpperCase();
}

export function fileLine(item: MediaItem): string {
  if (item.width === null || item.height === null) return item.name;
  return `${item.name} · ${String(item.width)} × ${String(item.height)}`;
}

export function fileDetail(item: MediaItem): string {
  const size =
    item.width === null || item.height === null ? null : megapixels(item.width, item.height);
  return present([size, bytes(item.bytes), typeLabel(item)]).join(' · ');
}

export function folderOf(relPath: string): string {
  const slash = relPath.lastIndexOf('/');
  return slash === -1 ? '' : relPath.slice(0, slash);
}

export function addedLine(item: MediaItem, library: string | null, by: string | null): string {
  const day = ADDED_DAY(null).format(new Date(item.addedAt));
  const added = by === null ? `Added ${day}` : `Added ${day} by ${by}`;
  return library === null ? added : `${library} · ${added}`;
}

export interface NoPreview {
  readonly icon: 'aperture' | 'image';
  readonly text: string;
}

export function noPreviewOf(item: MediaItem): NoPreview {
  return isRaw(item)
    ? {
        icon: 'aperture',
        text: 'The hub cannot make a preview for this RAW file yet. The original is kept as it is.',
      }
    : {
        icon: 'image',
        text: 'The hub cannot make a preview for this file. The original is kept as it is.',
      };
}

export function askLabel(item: MediaItem): string {
  return item.kind === 'video' ? 'Ask about this video' : 'Ask about this photo';
}

export function placeLine(place: PhotoPlace): string {
  return present([place.name, place.admin, place.country]).join(', ');
}

export function dayCountText(position: number, total: number, today: boolean): string {
  return `${String(position)} of ${String(total)} ${today ? 'today' : 'that day'}`;
}
