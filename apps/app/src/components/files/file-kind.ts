import type { FileEntry } from '@smarteverything/domain';
import { plural } from '../../format/text';

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);

export type EntryKind = FileEntry['kind'];

export type EntryGlyph = 'folder' | 'link' | 'image' | 'fileText';

export function glyphOf(entry: { readonly kind: EntryKind; readonly name: string }): EntryGlyph {
  if (entry.kind === 'folder') return 'folder';
  if (entry.kind === 'link') return 'link';
  const extension = entry.name.split('.').at(-1)?.toLowerCase() ?? '';
  return entry.name.includes('.') && IMAGE_EXTENSIONS.has(extension) ? 'image' : 'fileText';
}

export function selectionLabel(count: number): string {
  return `${plural(count, 'item')} selected`;
}
