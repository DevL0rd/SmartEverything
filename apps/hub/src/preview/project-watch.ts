import { watch, type FSWatcher } from 'node:fs';
import { dirname, basename } from 'node:path';
import type { Logger } from '@smarteverything/logging';
const SETTLE_MS = 75;
interface RootWatch {
  readonly watchers: readonly FSWatcher[];
  timer: NodeJS.Timeout | undefined;
}
export class PreviewProjectWatch {
  private readonly entries = new Map<string, RootWatch>();
  constructor(private readonly log: Logger) {}
  add(
    id: string,
    root: string,
    events: {
      readonly changed: () => void;
      readonly failed: () => void;
      readonly touched: () => void;
    },
  ): void {
    this.remove(id);
    const watchers: FSWatcher[] = [];
    const scope: RootWatch = { watchers, timer: undefined };
    const settle = (): void => {
      events.touched();
      clearTimeout(scope.timer);
      scope.timer = setTimeout(events.changed, SETTLE_MS);
      scope.timer.unref();
    };
    const error = (cause: unknown): void => {
      this.log.warn('project.watch_failed', {
        publication_id: id,
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
      this.remove(id);
      events.failed();
    };
    try {
      watchers.push(watch(root, { recursive: true }, settle));
      watchers.push(
        watch(dirname(root), (_event, name) => {
          if (name === null || name === basename(root)) settle();
        }),
      );
      for (const watcher of watchers) {
        watcher.unref();
        watcher.on('error', error);
      }
      this.entries.set(id, scope);
    } catch (cause) {
      for (const watcher of watchers) watcher.close();
      error(cause);
    }
  }
  signal(id: string, changed: () => void): void {
    const scope = this.entries.get(id);
    if (scope === undefined) return;
    clearTimeout(scope.timer);
    scope.timer = setTimeout(changed, SETTLE_MS);
    scope.timer.unref();
  }
  remove(id: string): void {
    const scope = this.entries.get(id);
    if (scope === undefined) return;
    clearTimeout(scope.timer);
    for (const watcher of scope.watchers) watcher.close();
    this.entries.delete(id);
  }
  stop(): void {
    for (const id of this.entries.keys()) this.remove(id);
  }
}
