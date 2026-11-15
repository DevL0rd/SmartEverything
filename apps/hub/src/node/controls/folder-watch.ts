import { WATCH_DEBOUNCE_MS } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import { messageOf } from '@smarteverything/logging';
import { watch } from 'node:fs';
import type { NodeLink } from '../link';

export interface FolderWatcher {
  readonly on: (event: 'error', listener: (cause: unknown) => void) => unknown;
  readonly close: () => void;
}

export interface FolderWatchOptions {
  readonly changed: (path: string) => void;
  readonly failed: (path: string, cause: unknown) => void;
  readonly watch?: (path: string, onEvent: () => void) => FolderWatcher;
  readonly schedule?: (work: () => void, ms: number) => () => void;
  readonly debounceMs?: number;
}

interface Watched {
  readonly watcher: FolderWatcher;
  cancel: (() => void) | null;
}

function nativeWatch(path: string, onEvent: () => void): FolderWatcher {
  return watch(path, { persistent: false }, onEvent);
}

function nativeSchedule(work: () => void, ms: number): () => void {
  const timer = setTimeout(work, ms);
  timer.unref();
  return (): void => {
    clearTimeout(timer);
  };
}

export class FolderWatch {
  private readonly watched = new Map<string, Watched>();

  constructor(private readonly options: FolderWatchOptions) {}

  sync(paths: readonly string[]): void {
    const wanted = new Set(paths);
    for (const path of [...this.watched.keys()]) {
      if (!wanted.has(path)) {
        this.drop(path);
      }
    }
    for (const path of wanted) {
      if (!this.watched.has(path)) {
        this.begin(path);
      }
    }
  }

  demand(paths: readonly string[] | undefined, allowed: boolean): void {
    this.sync(allowed ? (paths ?? []) : []);
  }

  stop(): void {
    this.sync([]);
  }

  private begin(path: string): void {
    try {
      const entry: Watched = {
        watcher: (this.options.watch ?? nativeWatch)(path, () => {
          this.event(path);
        }),
        cancel: null,
      };
      entry.watcher.on('error', (cause) => {
        this.drop(path);
        this.options.failed(path, cause);
        this.options.changed(path);
      });
      this.watched.set(path, entry);
    } catch (cause) {
      this.options.failed(path, cause);
    }
  }

  private event(path: string): void {
    const entry = this.watched.get(path);
    if (entry?.cancel === null) {
      entry.cancel = (this.options.schedule ?? nativeSchedule)(() => {
        entry.cancel = null;
        this.options.changed(path);
      }, this.options.debounceMs ?? WATCH_DEBOUNCE_MS);
    }
  }

  private drop(path: string): void {
    const entry = this.watched.get(path);
    if (entry === undefined) {
      return;
    }
    this.watched.delete(path);
    entry.cancel?.();
    entry.watcher.close();
  }
}

export function nodeFolderWatch(link: NodeLink, log: Logger): FolderWatch {
  return new FolderWatch({
    changed: (path): void => {
      link.send({ type: 'files_changed', path });
    },
    failed: (path, cause): void => {
      log.warn('node.folder_watch_failed', { path, reason: messageOf(cause).slice(0, 300) });
    },
  });
}
