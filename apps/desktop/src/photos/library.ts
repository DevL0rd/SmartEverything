import { createHash } from 'node:crypto';
import { createReadStream, watch, type FSWatcher } from 'node:fs';
import { lstat, realpath } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import type { DesktopPhotoLibrary } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { fileCode, scanPhotos, type PhotoFile } from './scan.js';

const log = new Logger('desktop.photos');

export class PhotoLibrary {
  private readonly files = new Map<string, PhotoFile>();
  private readonly operations = new Map<string, AbortController>();
  private readonly watchers = new Map<string, FSWatcher>();
  private readonly listeners = new Set<() => void>();
  private scanning: Promise<DesktopPhotoLibrary> | null = null;
  private dirty = false;
  private readonly scanAbort = new AbortController();
  constructor(
    private readonly roots: readonly string[],
    private readonly scan = scanPhotos,
  ) {}

  list(): Promise<DesktopPhotoLibrary> {
    for (const root of new Set(this.roots)) this.watch(root);
    this.scanning ??= this.readCurrent().finally(() => {
      this.scanning = null;
    });
    return this.scanning;
  }

  private async readCurrent(): Promise<DesktopPhotoLibrary> {
    let scan;
    do {
      this.dirty = false;
      scan = await this.scan(this.roots, this.scanAbort.signal);
      this.scanAbort.signal.throwIfAborted();
    } while (this.scanChanged());
    this.files.clear();
    for (const file of scan.files) this.files.set(file.item.id, file);
    return {
      items: scan.files.map((file) => file.item).sort((a, b) => b.takenAt - a.takenAt),
      issues: scan.issues,
    };
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }

  private scanChanged(): boolean {
    return this.dirty;
  }

  private watch(root: string): void {
    if (this.watchers.has(root)) return;
    try {
      const watcher = watch(root, { recursive: true }, () => {
        this.invalidate();
      });
      watcher.on('error', (cause: unknown) => {
        log.error('library.watch_failed', cause);
        watcher.close();
        this.watchers.delete(root);
        this.invalidate();
      });
      this.watchers.set(root, watcher);
    } catch (cause) {
      log.warn('library.watch_unavailable', { code: fileCode(cause) ?? 'unknown' });
      if (fileCode(cause) === 'ENOENT') this.watchParent(root);
    }
  }

  private watchParent(root: string): void {
    const key = `parent:${root}`;
    if (this.watchers.has(key)) return;
    try {
      const watcher = watch(dirname(root), (_event, name) => {
        if (name === basename(root)) this.invalidate();
      });
      watcher.on('error', (cause: unknown) => {
        log.error('library.parent_watch_failed', cause);
        watcher.close();
        this.watchers.delete(key);
      });
      this.watchers.set(key, watcher);
    } catch (cause) {
      log.error('library.parent_watch_unavailable', cause);
    }
  }

  invalidate(): void {
    this.dirty = true;
    for (const listener of this.listeners) listener();
  }

  async file(id: string): Promise<PhotoFile> {
    const file = this.files.get(id);
    if (file === undefined) throw new Error('This local media item is no longer in the library.');
    const current = await lstat(file.path);
    if (
      (await realpath(file.path)) !== file.path ||
      !current.isFile() ||
      current.size !== file.item.bytes ||
      current.mtimeMs !== file.item.modifiedAt
    )
      throw new Error('This local media item changed. Refresh the library.');
    return file;
  }

  async hash(id: string, operation: string): Promise<{ sha256: string; bytes: number }> {
    if (this.operations.has(operation)) throw new Error('Photo operation already exists.');
    const controller = new AbortController();
    this.operations.set(operation, controller);
    try {
      const file = await this.file(id);
      controller.signal.throwIfAborted();
      const hash = createHash('sha256');
      let bytes = 0;
      for await (const chunk of createReadStream(file.path, { signal: controller.signal })) {
        if (!(chunk instanceof Uint8Array)) throw new TypeError('Media stream produced text.');
        hash.update(chunk);
        bytes += chunk.length;
      }
      await this.file(id);
      return { sha256: hash.digest('hex'), bytes };
    } finally {
      this.operations.delete(operation);
    }
  }

  cancel(operation: string): void {
    this.operations.get(operation)?.abort();
  }

  close(): void {
    this.scanAbort.abort();
    for (const watcher of this.watchers.values()) watcher.close();
    this.watchers.clear();
    for (const controller of this.operations.values()) controller.abort();
    this.listeners.clear();
  }
}
