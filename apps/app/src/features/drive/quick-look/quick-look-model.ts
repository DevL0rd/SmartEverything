import type { DriveItem } from '@smarteverything/domain';
import type { KeyPress } from '../../../design/keyboard';
import { bytes, count } from '../../../format/number';
import { joinParts } from '../../../format/text';
import { moment } from '../../../format/time';
import { rememberTab } from '../details/details-model';
import { captionOf } from '../folder/folder-model';

export interface QuickLookTarget {
  readonly items: readonly DriveItem[];
  readonly focused: DriveItem | null;
  readonly close: () => void;
  readonly focus: (item: DriveItem) => void;
  readonly details: ((item: DriveItem) => void) | null;
}

export interface QuickLookPlace {
  readonly position: number | null;
  readonly total: number;
  readonly previous: DriveItem | null;
  readonly next: DriveItem | null;
}

export type QuickLookContent = 'folder' | 'image' | 'video' | 'audio' | 'text' | 'picture' | 'none';

export type QuickLookKey = 'previous' | 'next' | 'close';

const SHOWN_IMAGE_MIMES = new Set([
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
  'image/bmp',
  'image/avif',
  'image/svg+xml',
]);

const TEXT_MIMES = new Set([
  'application/json',
  'application/xml',
  'application/javascript',
  'application/x-javascript',
  'application/typescript',
  'application/x-sh',
  'application/x-yaml',
  'application/yaml',
  'application/toml',
  'application/sql',
  'application/x-ndjson',
]);

const KEYS: Readonly<Record<string, QuickLookKey>> = {
  ArrowLeft: 'previous',
  ArrowRight: 'next',
  ' ': 'close',
};

function isFile(item: DriveItem): boolean {
  return item.kind !== 'folder';
}

function nearest(items: readonly DriveItem[], from: number, by: 1 | -1): DriveItem | null {
  for (let at = from + by; at >= 0 && at < items.length; at += by) {
    const item = items[at];
    if (item !== undefined && isFile(item)) return item;
  }
  return null;
}

export function placeOf(items: readonly DriveItem[], current: DriveItem): QuickLookPlace {
  const files = items.filter(isFile);
  const at = items.findIndex((item) => item.id === current.id);
  const position = files.findIndex((item) => item.id === current.id);
  return {
    position: position === -1 ? null : position + 1,
    total: files.length,
    previous: at === -1 ? null : nearest(items, at, -1),
    next: at === -1 ? null : nearest(items, at, 1),
  };
}

export function stepOf(
  items: readonly DriveItem[],
  current: DriveItem,
  direction: 'previous' | 'next',
): DriveItem | null {
  const place = placeOf(items, current);
  return direction === 'next' ? place.next : place.previous;
}

export function positionText(place: QuickLookPlace): string | null {
  if (place.position === null || place.total < 2) return null;
  return `${count(place.position)} of ${count(place.total)}`;
}

export function isTextMime(mime: string): boolean {
  const type = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return (
    type.startsWith('text/') ||
    type.endsWith('+json') ||
    type.endsWith('+xml') ||
    TEXT_MIMES.has(type)
  );
}

export function showsImageFile(mime: string): boolean {
  return SHOWN_IMAGE_MIMES.has(mime.toLowerCase());
}

function documentContent(item: Extract<DriveItem, { readonly mime: string }>): QuickLookContent {
  if (isTextMime(item.mime)) return 'text';
  return item.thumb.state === 'ready' ? 'picture' : 'none';
}

export function contentOf(item: DriveItem): QuickLookContent {
  switch (item.kind) {
    case 'folder':
      return 'folder';
    case 'image':
      return item.thumb.state === 'ready' || showsImageFile(item.mime) ? 'image' : 'none';
    case 'video':
    case 'audio':
      return item.kind;
    case 'document':
    case 'other':
      return documentContent(item);
  }
}

export function kindLabelOf(item: DriveItem): string {
  if (item.kind === 'folder') return 'Folder';
  const dot = item.name.lastIndexOf('.');
  if (dot > 0 && dot < item.name.length - 1) return item.name.slice(dot + 1).toUpperCase();
  return item.kind === 'other' ? 'File' : item.kind.charAt(0).toUpperCase() + item.kind.slice(1);
}

export function quickLookCaption(item: DriveItem, now: number): string {
  return joinParts([
    kindLabelOf(item),
    captionOf(item),
    bytes(item.bytes),
    `changed ${moment(item.modifiedAt, now)}`,
  ]);
}

export function quickLookKeyFor(press: KeyPress): QuickLookKey | null {
  if (press.typing || press.command || press.alt || press.shift) return null;
  return KEYS[press.key] ?? null;
}

export function detailsOnInfo(
  details: ((item: DriveItem) => void) | null,
  item: DriveItem,
): (() => void) | null {
  if (details === null) return null;
  return (): void => {
    rememberTab('info');
    details(item);
  };
}
