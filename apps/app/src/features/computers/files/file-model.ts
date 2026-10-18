import type {
  FileEntry,
  FileProperties,
  FileUploadChunk,
  FileWriteChange,
  FileWriteResult,
} from '@smarteverything/domain';
import { FILE_CHUNK_BYTES } from '@smarteverything/domain';
import { plural } from '../../../format/text';

export function baseName(path: string): string {
  return (
    path
      .split('/')
      .filter((part) => part !== '')
      .at(-1) ?? '/'
  );
}

export function joinPath(folder: string, name: string): string {
  return `${folder === '/' ? '' : folder}/${name}`;
}

export function parentOf(path: string): string {
  const parts = path.split('/').filter((part) => part !== '');
  return parts.length <= 1 ? '/' : `/${parts.slice(0, -1).join('/')}`;
}

export function permissionsWords(permissions: FileProperties['permissions']): string {
  if (permissions.readable && permissions.writable) return 'You can read and change it.';
  if (permissions.readable) return 'You can only read it.';
  return 'You can’t open it.';
}

export function uniqueName(name: string, taken: ReadonlySet<string>): string {
  if (!taken.has(name)) return name;
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let number = 2; ; number += 1) {
    const candidate = `${stem} (${String(number)})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export interface Piece {
  readonly start: number;
  readonly end: number;
  readonly final: boolean;
}

export function piecesOf(size: number, piece = FILE_CHUNK_BYTES): readonly Piece[] {
  if (size === 0) return [{ start: 0, end: 0, final: true }];
  const pieces: Piece[] = [];
  for (let start = 0; start < size; start += piece) {
    const end = Math.min(size, start + piece);
    pieces.push({ start, end, final: end === size });
  }
  return pieces;
}

export function chunkOf(
  path: string,
  piece: Piece,
  data: string,
  replace: boolean,
): FileUploadChunk {
  return { path, start: piece.start, data, final: piece.final, replace };
}

export function base64Of(buffer: ArrayBuffer, start: number, end: number): string {
  const view = new Uint8Array(buffer, start, end - start);
  let binary = '';
  for (let index = 0; index < view.length; index += 0x8000) {
    binary += String.fromCharCode(...view.subarray(index, index + 0x8000));
  }
  return btoa(binary);
}

export function sourceWord(native: boolean): string {
  return native ? 'this phone' : 'this device';
}

export function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

export function itemWord(count: number): string {
  return plural(count, 'item');
}

function folderWord(path: string): string {
  return path === '/' ? 'the computer’s root folder' : baseName(path);
}

export function doneMessage(change: FileWriteChange, result: FileWriteResult): string | null {
  const count = result.done.length;
  if (count === 0) return null;
  switch (change.action) {
    case 'new_folder':
      return `Created ${baseName(change.path)}`;
    case 'rename':
      return `Renamed to ${change.name}`;
    case 'move':
      return `Moved ${itemWord(count)} to ${folderWord(change.to)}`;
    case 'copy':
      return `Copied ${itemWord(count)} to ${folderWord(change.to)}`;
    case 'trash':
      return `Moved ${itemWord(count)} to Trash`;
    case 'restore':
      return `Restored ${itemWord(count)}`;
  }
}

export function trashIdsOf(result: FileWriteResult): string[] {
  return result.done.flatMap((item) => (item.trashId === null ? [] : [item.trashId]));
}

export function failureMessage(change: FileWriteChange, path: string, reason: string): string {
  const verb = {
    new_folder: 'created',
    rename: 'renamed',
    move: 'moved',
    copy: 'copied',
    trash: 'moved to Trash',
    restore: 'restored',
  }[change.action];
  return `${baseName(path)} wasn’t ${verb}: ${reason}`;
}

const IMAGE_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg', 'avif']);

export type EntryGlyph = 'folder' | 'link' | 'image' | 'fileText';

export function glyphOf(entry: Pick<FileEntry, 'kind' | 'name'>): EntryGlyph {
  if (entry.kind === 'folder') return 'folder';
  if (entry.kind === 'link') return 'link';
  const extension = entry.name.split('.').at(-1)?.toLowerCase() ?? '';
  return entry.name.includes('.') && IMAGE_EXTENSIONS.has(extension) ? 'image' : 'fileText';
}

export type RowAction =
  'open' | 'download' | 'select' | 'attach' | 'rename' | 'move' | 'copy' | 'trash' | 'properties';

export function nameError(name: string): string | null {
  const text = name.trim();
  if (text === '') return null;
  if (text.includes('/')) return 'A name can’t contain a slash.';
  if (text === '.' || text === '..') return 'That name isn’t allowed.';
  return text.length > 255 ? 'Use a name up to 255 characters.' : null;
}
