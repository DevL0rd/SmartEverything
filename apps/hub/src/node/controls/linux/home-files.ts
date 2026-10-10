import {
  FILE_ENTRY_LIMIT,
  FILE_READ_LIMIT_BYTES,
  type FileContent,
  type FileEntry,
  type FileList,
} from '@smarteverything/domain';
import type { Dirent, Stats } from 'node:fs';
import { lstat, readdir, readFile, realpath } from 'node:fs/promises';
import { homedir } from 'node:os';
import { basename, dirname, extname, join, sep } from 'node:path';
import { NodeFailureError } from '../../node-failure';
import type { FileControl } from '../session-controls';

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
};

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

function missing(cause: unknown): boolean {
  return (
    cause instanceof Error &&
    'code' in cause &&
    (cause.code === 'ENOENT' || cause.code === 'ENOTDIR')
  );
}

export class HomeFiles implements FileControl {
  constructor(private readonly home: string = homedir()) {}

  async list(path: string | null): Promise<FileList> {
    const folder = await this.inside(path ?? this.home);
    const entries = await readdir(folder, { withFileTypes: true });
    const rows = await Promise.all(entries.map((entry) => this.entryOf(folder, entry)));
    const sorted = rows
      .filter((row) => row !== null)
      .sort(
        (a, b) =>
          Number(b.kind === 'folder') - Number(a.kind === 'folder') || a.name.localeCompare(b.name),
      );
    return {
      path: folder,
      parent: folder === this.home ? null : dirname(folder),
      entries: sorted.slice(0, FILE_ENTRY_LIMIT),
      total: sorted.length,
    };
  }

  async read(path: string): Promise<FileContent> {
    const file = await this.inside(path);
    const stats = await lstat(file);
    if (!stats.isFile()) {
      throw new NodeFailureError('not_supported', 'Only files can be opened, not folders.');
    }
    if (stats.size > FILE_READ_LIMIT_BYTES) {
      throw new NodeFailureError('not_supported', 'That file is larger than 5 MB.');
    }
    const data = await readFile(file);
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

  private async inside(path: string): Promise<string> {
    let real: string;
    try {
      real = await realpath(path);
    } catch (cause) {
      if (missing(cause)) {
        throw new NodeFailureError('not_found', 'That file or folder does not exist.');
      }
      throw cause;
    }
    if (real !== this.home && !real.startsWith(this.home + sep)) {
      throw new NodeFailureError('not_permitted', 'Only files in your home folder can be opened.');
    }
    return real;
  }

  private async entryOf(folder: string, entry: Dirent): Promise<FileEntry | null> {
    const path = join(folder, entry.name);
    let stats: Stats;
    try {
      stats = await lstat(path);
    } catch (cause) {
      if (missing(cause)) {
        return null;
      }
      throw cause;
    }
    return {
      name: entry.name,
      path,
      kind: kindOf(entry),
      size: stats.size,
      modifiedAt: stats.mtime.toISOString(),
    };
  }
}
