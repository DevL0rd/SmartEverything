import type { FileEntry } from '@smarteverything/domain';
import { plural } from '../../format/text';

export type EntryKind = FileEntry['kind'];

export type EntryGlyph = 'folder' | 'link' | 'image' | 'film' | 'music' | 'archive' | 'fileText';

const EXTENSION_GLYPH: ReadonlyMap<string, EntryGlyph> = new Map([
  ...['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif', 'heic', 'heif'].map(
    (extension) => [extension, 'image'] as const,
  ),
  ...['mp4', 'mov', 'm4v', 'mkv', 'webm', 'avi'].map((extension) => [extension, 'film'] as const),
  ...['mp3', 'm4a', 'aac', 'flac', 'wav', 'ogg', 'opus'].map(
    (extension) => [extension, 'music'] as const,
  ),
  ...['zip', 'tar', 'gz', 'tgz', '7z', 'rar', 'xz', 'bz2'].map(
    (extension) => [extension, 'archive'] as const,
  ),
]);

export function glyphOf(entry: { readonly kind: EntryKind; readonly name: string }): EntryGlyph {
  if (entry.kind === 'folder') return 'folder';
  if (entry.kind === 'link') return 'link';
  if (!entry.name.includes('.')) return 'fileText';
  const extension = entry.name.split('.').at(-1)?.toLowerCase() ?? '';
  return EXTENSION_GLYPH.get(extension) ?? 'fileText';
}

export function selectionLabel(count: number): string {
  return `${plural(count, 'item')} selected`;
}
