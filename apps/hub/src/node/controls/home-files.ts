import {
  FILE_INLINE_LIMIT_BYTES,
  FILE_PAGE_SIZE,
  type FileContent,
  type FileEntry,
  type FileList,
  type FileRange,
  type FileSort,
} from '@smarteverything/domain';
import type { Dirent, Stats } from 'node:fs';
import { lstat, open, readdir, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join } from 'node:path';
import { NodeFailureError } from '../node-failure';
import { fsCode } from '../../fs-code';
import { isMissing } from '../../fs-util';
import type { FileControl } from './session-controls';

const TEXT_LIMIT_BYTES = 256 * 1024;

const MIME: Readonly<Record<string, string>> = {
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.log': 'text/plain',
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4',
  '.zip': 'application/zip',
  '.html': 'text/html',
  '.css': 'text/css',
  '.xml': 'application/xml',
  '.yaml': 'application/yaml',
  '.yml': 'application/yaml',
  '.toml': 'application/toml',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.ts': 'text/typescript',
  '.tsx': 'text/typescript',
  '.jsx': 'text/javascript',
  '.sh': 'text/x-shellscript',
  '.py': 'text/x-python',
  '.ini': 'text/plain',
  '.conf': 'text/plain',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.tiff': 'image/tiff',
  '.wav': 'audio/wav',
  '.flac': 'audio/flac',
  '.ogg': 'audio/ogg',
  '.opus': 'audio/opus',
  '.m4a': 'audio/mp4',
  '.mkv': 'video/x-matroska',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.avi': 'video/x-msvideo',
  '.gz': 'application/gzip',
  '.tar': 'application/x-tar',
  '.7z': 'application/x-7z-compressed',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
};

export function mimeOf(path: string): string | undefined {
  return MIME[extname(path).toLowerCase()];
}

const TEXT_MIMES: ReadonlySet<string> = new Set([
  'application/json',
  'application/xml',
  'application/yaml',
  'application/toml',
  'image/svg+xml',
]);

export function holdsText(mime: string | null): boolean {
  return mime === null || mime.startsWith('text/') || TEXT_MIMES.has(mime);
}

function kindOf(entry: Dirent): FileEntry['kind'] {
  if (entry.isDirectory()) {
    return 'folder';
  }
  if (entry.isSymbolicLink()) {
    return 'link';
  }
  return entry.isFile() ? 'file' : 'other';
}

function asText(data: Buffer): string | null {
  if (data.length > TEXT_LIMIT_BYTES || data.includes(0)) {
    return null;
  }
  const text = new TextDecoder('utf-8', { fatal: false }).decode(data);
  return text.includes('�') ? null : text;
}

async function readable<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (cause) {
    const code = fsCode(cause);
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw new NodeFailureError('not_found', 'That file or folder does not exist.');
    }
    if (code === 'EACCES' || code === 'EPERM') {
      throw new NodeFailureError('not_permitted', 'The signed-in user cannot read that.');
    }
    throw cause;
  }
}

function naturalName(a: string, b: string): number {
  return (
    a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' }) || a.localeCompare(b)
  );
}

function byKindThenName(direction: number) {
  return (a: Dirent, b: Dirent): number =>
    Number(b.isDirectory()) - Number(a.isDirectory()) || direction * naturalName(a.name, b.name);
}

function byKindThenField(field: 'size' | 'modifiedAt', direction: number) {
  return (a: FileEntry, b: FileEntry): number => {
    const folders = Number(b.kind === 'folder') - Number(a.kind === 'folder');
    const left = field === 'size' ? a.size : Date.parse(a.modifiedAt);
    const right = field === 'size' ? b.size : Date.parse(b.modifiedAt);
    return folders || direction * (left - right) || naturalName(a.name, b.name);
  };
}

export async function fileAt(path: string): Promise<{ file: string; stats: Stats }> {
  const file = await readable(realpath(path));
  const stats = await readable(lstat(file));
  if (!stats.isFile()) {
    throw new NodeFailureError('not_supported', 'Only files can be opened, not folders.');
  }
  return { file, stats };
}

export async function describeEntry(folder: string, entry: Dirent): Promise<FileEntry | null> {
  const path = join(folder, entry.name);
  try {
    const stats = await lstat(path);
    const kind = kindOf(entry);
    return {
      name: entry.name,
      path,
      kind,
      mime: kind === 'folder' ? null : (mimeOf(entry.name) ?? null),
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
      hidden: entry.name.startsWith('.'),
    };
  } catch (cause) {
    if (isMissing(cause)) {
      return null;
    }
    throw cause;
  }
}

export class HomeFiles implements FileControl {
  constructor(private readonly home: string = homedir()) {}

  async list(path: string | null, cursor: number, sort?: FileSort): Promise<FileList> {
    const folder = await readable(realpath(path ?? this.home));
    const entries = await readable(readdir(folder, { withFileTypes: true }));
    const direction = sort?.direction === 'desc' ? -1 : 1;
    const end = cursor + FILE_PAGE_SIZE;
    const parent = dirname(folder) === folder ? null : dirname(folder);
    const next = end < entries.length ? end : null;
    if (sort === undefined || sort.field === 'name') {
      const page = entries.sort(byKindThenName(direction)).slice(cursor, end);
      const rows = await Promise.all(page.map((entry) => describeEntry(folder, entry)));
      return {
        path: folder,
        parent,
        entries: rows.filter((row) => row !== null),
        total: entries.length,
        next,
      };
    }
    const described = await Promise.all(entries.map((entry) => describeEntry(folder, entry)));
    const rows = described
      .filter((row) => row !== null)
      .sort(byKindThenField(sort.field, direction));
    return {
      path: folder,
      parent,
      entries: rows.slice(cursor, end),
      total: entries.length,
      next,
    };
  }

  async read(path: string): Promise<FileContent> {
    const { file, stats } = await fileAt(path);
    if (stats.size > FILE_INLINE_LIMIT_BYTES) {
      throw new NodeFailureError(
        'not_supported',
        'That file is larger than 5 MB; download it instead of opening it here.',
      );
    }
    const data = await readable(readFile(file));
    const text = asText(data);
    return {
      name: basename(file),
      path: file,
      size: stats.size,
      mimeType:
        MIME[extname(file).toLowerCase()] ??
        (text === null ? 'application/octet-stream' : 'text/plain'),
      encoding: text === null ? 'base64' : 'text',
      content: text ?? data.toString('base64'),
    };
  }

  async range(path: string, start: number, length: number): Promise<FileRange> {
    const { file, stats } = await fileAt(path);
    const handle = await readable(open(file, 'r'));
    try {
      const buffer = Buffer.alloc(Math.max(0, Math.min(length, stats.size - start)));
      const { bytesRead } = await handle.read(buffer, 0, buffer.length, start);
      return {
        name: basename(file),
        size: stats.size,
        mimeType: MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
        data: buffer.subarray(0, bytesRead).toString('base64'),
      };
    } finally {
      await handle.close();
    }
  }
}
