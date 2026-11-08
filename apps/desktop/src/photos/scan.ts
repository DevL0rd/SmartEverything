import { createHash } from 'node:crypto';
import { lstat, readdir, realpath } from 'node:fs/promises';
import { basename, extname, join } from 'node:path';
import type { DesktopPhotoItem, DesktopPhotoLibrary } from '@smarteverything/domain';

const TYPES: Readonly<Record<string, string>> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.avif': 'image/avif',
  '.heic': 'image/heic',
  '.heif': 'image/heif',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.avi': 'video/x-msvideo',
  '.3gp': 'video/3gpp',
};
export interface PhotoFile {
  readonly item: DesktopPhotoItem;
  readonly path: string;
}
export interface PhotoScan {
  readonly files: readonly PhotoFile[];
  readonly issues: DesktopPhotoLibrary['issues'];
}

export function fileCode(cause: unknown): string | undefined {
  return cause instanceof Error && 'code' in cause && typeof cause.code === 'string'
    ? cause.code
    : undefined;
}

async function entryOf(path: string): Promise<PhotoFile | null> {
  const mimeType = TYPES[extname(path).toLowerCase()];
  if (mimeType === undefined) return null;
  const info = await lstat(path);
  if (!info.isFile()) return null;
  const canonical = await realpath(path);
  const id = createHash('sha256').update(canonical).digest('hex');
  return {
    path: canonical,
    item: {
      id,
      name: basename(path),
      mimeType,
      bytes: info.size,
      modifiedAt: info.mtimeMs,
      takenAt: info.birthtimeMs > 0 ? info.birthtimeMs : info.mtimeMs,
      uri: `app://smarteverything/local-media/${id}`,
      video: mimeType.startsWith('video/'),
    },
  };
}

class PhotoTree {
  readonly files = new Map<string, PhotoFile>();
  readonly issues: { folder: string; message: string }[] = [];
  constructor(private readonly signal?: AbortSignal) {}

  private issue(folder: string, cause: unknown): void {
    this.signal?.throwIfAborted();
    this.issues.push({
      folder,
      message:
        fileCode(cause) === 'ENOENT'
          ? 'Folder is not available.'
          : 'Could not read this media folder.',
    });
  }

  private async entry(folder: string, name: string, directory: boolean): Promise<void> {
    this.signal?.throwIfAborted();
    const path = join(folder, name);
    if (directory) return this.visit(path);
    try {
      const file = await entryOf(path);
      if (file !== null) this.files.set(file.item.id, file);
    } catch (cause) {
      this.issue(folder, cause);
    }
  }

  async visit(folder: string, optionalRoot = false): Promise<void> {
    this.signal?.throwIfAborted();
    let entries;
    try {
      entries = await readdir(folder, { withFileTypes: true });
    } catch (cause) {
      this.signal?.throwIfAborted();
      if (!optionalRoot || fileCode(cause) !== 'ENOENT') this.issue(folder, cause);
      return;
    }
    for (const entry of entries) {
      if (entry.isDirectory() || entry.isFile())
        await this.entry(folder, entry.name, entry.isDirectory());
    }
  }
}

export async function scanPhotos(
  roots: readonly string[],
  signal?: AbortSignal,
): Promise<PhotoScan> {
  const tree = new PhotoTree(signal);
  for (const root of new Set(roots)) await tree.visit(root, true);
  return { files: [...tree.files.values()], issues: tree.issues };
}
