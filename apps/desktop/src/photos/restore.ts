import { createHash, randomBytes } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { copyFile, link, mkdir, readdir, rm, stat, utimes } from 'node:fs/promises';
import { basename, extname, isAbsolute, join, relative, resolve } from 'node:path';
import type { NativeHubResourceRestore, NativeHubResourceRestored } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { fileCode } from './scan.js';

const log = new Logger('desktop.photos');

export const RESTORED_FOLDER = 'Restored';

interface Content {
  readonly sha256: string;
  readonly bytes: number;
}

export class PhotoRestoreError extends Error {
  override readonly name = 'PhotoRestoreError';
}

async function contentOf(path: string): Promise<Content> {
  const hash = createHash('sha256');
  let bytes = 0;
  for await (const chunk of createReadStream(path)) {
    if (!(chunk instanceof Uint8Array)) throw new TypeError('Media stream produced text.');
    hash.update(chunk);
    bytes += chunk.length;
  }
  return { sha256: hash.digest('hex'), bytes };
}

function within(root: string, path: string): boolean {
  const inside = relative(root, path);
  return inside === '' || (!inside.startsWith('..') && !isAbsolute(inside));
}

function candidateName(name: string, attempt: number): string {
  if (attempt === 0) return name;
  const extension = extname(name);
  return `${name.slice(0, name.length - extension.length)} (${String(attempt)})${extension}`;
}

async function presentCopy(folder: string, content: Content): Promise<string | null> {
  const entries = await readdir(folder, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || entry.name.startsWith('.smarteverything-restore-')) continue;
    const path = join(folder, entry.name);
    if ((await stat(path)).size !== content.bytes) continue;
    if ((await contentOf(path)).sha256 === content.sha256) return path;
  }
  return null;
}

async function linkFree(staged: string, folder: string, name: string): Promise<string> {
  for (let attempt = 0; ; attempt += 1) {
    const path = join(folder, candidateName(name, attempt));
    try {
      await link(staged, path);
      return path;
    } catch (cause) {
      if (fileCode(cause) !== 'EEXIST') throw cause;
    }
  }
}

export class PhotoRestore {
  private readonly roots: readonly string[];
  readonly restored: string;

  constructor(pictures: string, videos: string) {
    this.roots = [resolve(pictures), resolve(videos)];
    this.restored = join(resolve(pictures), RESTORED_FOLDER);
  }

  folderOf(request: NativeHubResourceRestore): string {
    if (request.target.kind === 'restored') return this.restored;
    const folder = resolve(request.target.folder);
    if (!isAbsolute(request.target.folder) || !this.roots.some((root) => within(root, folder)))
      throw new PhotoRestoreError('The original folder is outside this computer’s photo folders.');
    return folder;
  }

  private fileName(request: NativeHubResourceRestore): string {
    const name = basename(request.name);
    if (name !== request.name || name === '.' || name === '..' || name.startsWith('.'))
      throw new PhotoRestoreError(`${request.name} is not a plain file name.`);
    return name;
  }

  async place(
    downloaded: string,
    request: NativeHubResourceRestore,
  ): Promise<NativeHubResourceRestored> {
    const name = this.fileName(request);
    const content = await contentOf(downloaded);
    if (request.sha256 !== null && request.sha256 !== content.sha256)
      throw new PhotoRestoreError(`${name} arrived changed; nothing was saved.`);
    const folder = this.folderOf(request);
    await mkdir(folder, { recursive: true });
    const present = await presentCopy(folder, content);
    if (present !== null) {
      log.info('restore.present', { target: request.target.kind });
      return { result: 'present', location: present };
    }
    const staged = join(folder, `.smarteverything-restore-${randomBytes(8).toString('hex')}`);
    try {
      await copyFile(downloaded, staged);
      if (request.takenAt !== null) {
        const at = new Date(request.takenAt);
        await utimes(staged, at, at);
      }
      const location = await linkFree(staged, folder, name);
      log.info('restore.saved', { target: request.target.kind });
      return { result: 'saved', location };
    } finally {
      await rm(staged, { force: true });
    }
  }

  revealable(location: string): string {
    const path = resolve(location);
    if (!isAbsolute(location) || !this.roots.some((root) => within(root, path)))
      throw new PhotoRestoreError('Only restored photos and videos can be shown.');
    return path;
  }
}
