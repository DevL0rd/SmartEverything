import { watch, type FSWatcher } from 'node:fs';
import { dirname, relative, sep } from 'node:path';
import type { Logger } from '@smarteverything/logging';
import { ClaudeWatchError } from './errors';
import { isMissing } from '../fs-util';

export interface PathWatchOptions {
  readonly directory: string;
  readonly recursive: boolean;
  readonly settleMs: number;
  readonly accepts: (name: string) => boolean;
  readonly changed: (name: string | null) => void;
  readonly log: Logger;
}

const WHOLE_DIRECTORY = '';

export class PathWatch {
  private watcher: FSWatcher | null = null;
  private waiting: FSWatcher | null = null;
  private stopped = true;
  private readonly timers = new Map<string, NodeJS.Timeout>();

  constructor(private readonly options: PathWatchOptions) {}

  start(): boolean {
    this.stopped = false;
    return this.attach();
  }

  stop(): void {
    this.stopped = true;
    this.closeWatchers();
    for (const timer of this.timers.values()) {
      clearTimeout(timer);
    }
    this.timers.clear();
  }

  private closeWatchers(): void {
    this.watcher?.close();
    this.waiting?.close();
    this.watcher = null;
    this.waiting = null;
  }

  private attach(): boolean {
    this.closeWatchers();
    if (this.stopped) {
      return false;
    }
    return this.open();
  }

  private open(): boolean {
    const { directory, recursive, log } = this.options;
    let watcher: FSWatcher;
    try {
      watcher = watch(directory, { persistent: false, recursive }, (_event, file) => {
        this.event(file);
      });
    } catch (cause) {
      if (isMissing(cause)) {
        this.awaitDirectory();
        return false;
      }
      throw new ClaudeWatchError(directory, cause);
    }
    watcher.on('error', (cause) => {
      log.warn('watch.failed', { directory, reason: cause.message });
      this.attach();
    });
    this.watcher = watcher;
    this.options.changed(null);
    return true;
  }

  private watchAncestor(ancestor: string): { waiting: FSWatcher; ancestor: string } {
    const next = relative(ancestor, this.options.directory).split(sep)[0];
    try {
      const waiting = watch(ancestor, { persistent: false }, (_event, file) => {
        if (file === next) {
          this.attach();
        }
      });
      return { waiting, ancestor };
    } catch (cause) {
      if (isMissing(cause) && dirname(ancestor) !== ancestor) {
        return this.watchAncestor(dirname(ancestor));
      }
      throw new ClaudeWatchError(ancestor, cause);
    }
  }

  private awaitDirectory(): void {
    const { log } = this.options;
    const { waiting, ancestor } = this.watchAncestor(dirname(this.options.directory));
    waiting.on('error', (cause) => {
      log.warn('watch.failed', { directory: ancestor, reason: cause.message });
      this.attach();
    });
    this.waiting = waiting;
  }

  private event(file: string | null): void {
    if (file !== null && !this.options.accepts(file)) {
      return;
    }
    const key = file ?? WHOLE_DIRECTORY;
    clearTimeout(this.timers.get(key));
    this.timers.set(
      key,
      setTimeout(() => {
        this.timers.delete(key);
        this.options.changed(file);
      }, this.options.settleMs),
    );
  }
}
