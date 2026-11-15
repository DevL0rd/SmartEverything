import { readdirSync, statSync, watch as fsWatch, type Dirent } from 'node:fs';
import { join, matchesGlob } from 'node:path';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { background, type Logger } from '@smarteverything/logging';
import { fsCode } from '../fs-code';
import type { DriveRootsRepository } from '../store/repositories/drive-roots';
import { MARKER_DIRECTORY } from './root-marker';
import { LOCKED_FOLDER } from './access';
import { ORPHAN_DIRECTORY } from './paths';
import type { DriveActivity } from './activity';
import { firstOutside, type IndexReader, type OutsideChange } from './watch-reflect';

export interface WatchHandle {
  readonly close: () => void;
  readonly onError: (listener: (cause: Error) => void) => void;
}

export type WatchFactory = (directory: string, onEvent: (name: string) => void) => WatchHandle;

export const systemWatch: WatchFactory = (directory, onEvent) => {
  const watcher = fsWatch(directory, (_type, name) => {
    onEvent(name ?? '');
  });
  return {
    close: (): void => {
      watcher.close();
    },
    onError: (listener): void => {
      watcher.on('error', listener);
    },
  };
};

export interface WatchEnvironment {
  readonly roots: Pick<DriveRootsRepository, 'find' | 'update'>;
  readonly index: IndexReader;
  readonly activity: DriveActivity;
  readonly mounted: (rootId: string) => boolean;
  readonly onPlacementChange: (listener: (rootId: string) => void) => () => void;
  readonly enqueueScan: (rootId: string) => void;
  readonly enqueueFollowUps: (rootId: string) => void;
  readonly watch: WatchFactory;
  readonly settleMs: number;
  readonly log: Logger;
}

export interface WatchStatus {
  readonly watching: boolean;
  readonly unreadable: readonly string[];
  readonly problem: string | null;
}

const EXHAUSTED = new Set(['ENOSPC', 'EMFILE', 'ENFILE']);

const PROBLEM_TEXT: Readonly<Record<string, string>> = {
  ENOSPC:
    'The system limit on watched folders is reached, so changes are found only when you open or rescan.',
  EMFILE:
    'The system limit on file watchers is reached, so changes are found only when you open or rescan.',
  ENFILE:
    'The system limit on open files is reached, so changes are found only when you open or rescan.',
};

function folderInode(path: string): number | undefined {
  const stats = statSync(path, { throwIfNoEntry: false });
  return stats?.isDirectory() === true ? stats.ino : undefined;
}

function ignoredByRoot(root: StoredDrive, relPath: string, includeHidden: boolean): boolean {
  if (relPath === '') return false;
  const segments = relPath.split('/');
  if (segments[0] === MARKER_DIRECTORY || segments[0] === ORPHAN_DIRECTORY) return true;
  if (
    !includeHidden &&
    segments.some(
      (segment, index) => segment.startsWith('.') && !(index === 0 && segment === LOCKED_FOLDER),
    )
  ) {
    return true;
  }
  const name = segments.at(-1) ?? relPath;
  return root.skipPatterns.some(
    (pattern) =>
      matchesGlob(relPath, pattern) || (!pattern.includes('/') && matchesGlob(name, pattern)),
  );
}

class RootWatch {
  private readonly watched = new Map<
    string,
    { readonly handle: WatchHandle; readonly ino: number }
  >();
  private readonly unreadable = new Set<string>();
  private touched = new Set<string>();
  private unknown = false;
  private opened = false;
  private mounted: boolean;
  private readonly unsubscribe: () => void;
  private timer: NodeJS.Timeout | undefined;
  private problem: string | null = null;
  private exhausted = false;
  private closed = false;

  constructor(
    private readonly env: WatchEnvironment,
    private readonly root: StoredDrive,
    private readonly report: (reason: string | null) => void,
  ) {
    this.mounted = env.mounted(root.id);
    this.unsubscribe = env.onPlacementChange((rootId) => {
      if (rootId === root.id) this.mounted = env.mounted(rootId);
    });
  }

  open(): void {
    this.attach(this.root.path);
    this.opened = true;
    this.env.log.info('drive.watch_started', {
      rootId: this.root.id,
      watchers: this.watched.size,
      unreadable: this.unreadable.size,
      problem: this.problem,
    });
  }

  close(): void {
    this.closed = true;
    this.unsubscribe();
    clearTimeout(this.timer);
    for (const { handle } of this.watched.values()) handle.close();
    this.watched.clear();
  }

  status(): WatchStatus {
    return {
      watching: !this.closed && this.watched.size > 0,
      unreadable: [...this.unreadable],
      problem: this.problem,
    };
  }

  get reason(): string | null {
    return this.problem;
  }

  private attach(directory: string): void {
    if (this.exhausted || this.watched.has(directory)) return;
    try {
      const ino = folderInode(directory);
      if (ino === undefined) return;
      this.add(directory, ino);
      for (const child of readdirSync(directory, { withFileTypes: true })) this.child(child);
    } catch (cause) {
      this.refused(directory, cause);
    }
  }

  private child(entry: Dirent): void {
    const absolute = join(entry.parentPath, entry.name);
    if (this.opened) this.touch(this.relOf(absolute));
    if (entry.isDirectory()) this.attach(absolute);
  }

  private add(directory: string, ino: number): void {
    const handle = this.env.watch(directory, (name) => {
      this.changed(directory, name);
    });
    handle.onError((cause) => {
      this.failed(directory, cause);
    });
    this.watched.set(directory, { handle, ino });
  }

  private detach(directory: string): void {
    const prefix = `${directory}/`;
    for (const [path, entry] of [...this.watched]) {
      if (path !== directory && !path.startsWith(prefix)) continue;
      entry.handle.close();
      this.watched.delete(path);
    }
  }

  private refused(directory: string, cause: unknown): void {
    const code = fsCode(cause) ?? 'UNKNOWN';
    if (code === 'ENOENT' || code === 'ENAMETOOLONG') return;
    if (code === 'EACCES') {
      this.unreadable.add(directory);
      this.env.log.warn('drive.watch_unreadable', { rootId: this.root.id, directory });
      return;
    }
    this.exhausted = EXHAUSTED.has(code);
    this.problem = PROBLEM_TEXT[code] ?? `The folder cannot be watched (${code}).`;
    this.env.log.error('drive.watch_refused', cause, {
      rootId: this.root.id,
      directory,
      code,
    });
  }

  private failed(directory: string, cause: Error): void {
    if (this.closed) return;
    const code = fsCode(cause) ?? 'UNKNOWN';
    this.env.log.error('drive.watch_failed', cause, { rootId: this.root.id, directory, code });
    this.problem = `The folder watch stopped (${code}), so changes are found only when you open or rescan.`;
    this.close();
    this.report(this.problem);
    this.env.enqueueScan(this.root.id);
  }

  private follow(absolute: string): void {
    const known = this.watched.get(absolute);
    let ino: number | undefined;
    try {
      ino = folderInode(absolute);
    } catch (cause) {
      this.refused(absolute, cause);
      return;
    }
    if (known !== undefined && known.ino !== ino) this.detach(absolute);
    if (ino !== undefined) this.attach(absolute);
  }

  private changed(base: string, name: string): void {
    if (this.closed) return;
    if (name === '') {
      if (this.ignored(this.relOf(base))) return;
      this.unknown = true;
      this.arm();
      return;
    }
    const absolute = join(base, name);
    this.follow(absolute);
    this.touch(this.relOf(absolute));
  }

  private relOf(absolute: string): string {
    return absolute.slice(this.root.path.length).replace(/^\/+/, '');
  }

  private ignored(relPath: string): boolean {
    return ignoredByRoot(this.root, relPath, this.root.includeHidden || this.mounted);
  }

  private touch(relPath: string): void {
    if (this.ignored(relPath)) return;
    this.touched.add(relPath);
    this.arm();
  }

  private arm(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      this.settle();
    }, this.env.settleMs);
    this.timer.unref();
  }

  private settle(): void {
    const touched = this.touched;
    const unknown = this.unknown;
    this.touched = new Set();
    this.unknown = false;
    if (unknown) {
      this.env.enqueueScan(this.root.id);
      return;
    }
    background(this.check([...touched]), 'drive.watch_check_crashed', {
      rootId: this.root.id,
    });
  }

  private async check(touched: readonly string[]): Promise<void> {
    const { activity } = this.env;
    let remaining = touched;
    for (;;) {
      await activity.quiet();
      if (this.stopped()) return;
      const generation = activity.generation;
      const outside = await this.outside(remaining);
      if (outside === 'failed' || this.stopped()) return;
      if (outside === null) {
        this.env.enqueueFollowUps(this.root.id);
        return;
      }
      if (activity.quietSince(generation)) {
        this.env.log.info('drive.watch_outside_change', { rootId: this.root.id, ...outside });
        this.env.enqueueScan(this.root.id);
        return;
      }
      remaining = remaining.slice(remaining.indexOf(outside.relPath));
    }
  }

  private stopped(): boolean {
    return this.closed;
  }

  private async outside(touched: readonly string[]): Promise<OutsideChange | null | 'failed'> {
    try {
      return await firstOutside(this.env.index, this.root, touched);
    } catch (cause) {
      this.env.log.error('drive.watch_check_failed', cause, { rootId: this.root.id });
      this.env.enqueueScan(this.root.id);
      return 'failed';
    }
  }
}

export class DriveWatchers {
  private readonly watches = new Map<string, RootWatch>();

  constructor(private readonly env: WatchEnvironment) {}

  start(root: StoredDrive): void {
    this.stop(root.id);
    const watch = new RootWatch(this.env, root, (reason) => {
      this.show(root.id, reason);
    });
    this.watches.set(root.id, watch);
    watch.open();
    this.show(root.id, watch.reason);
    this.env.enqueueScan(root.id);
  }

  remounted(rootId: string): void {
    const root = this.env.roots.find(rootId);
    if (root === undefined) {
      this.stop(rootId);
      return;
    }
    this.start(root);
  }

  reconcile(rootId: string): void {
    this.env.enqueueScan(rootId);
  }

  status(rootId: string): WatchStatus {
    return this.watches.get(rootId)?.status() ?? { watching: false, unreadable: [], problem: null };
  }

  refresh(rootId: string): void {
    this.show(rootId, this.watches.get(rootId)?.reason ?? null);
  }

  stop(rootId: string): void {
    this.watches.get(rootId)?.close();
    this.watches.delete(rootId);
  }

  close(): void {
    for (const rootId of [...this.watches.keys()]) this.stop(rootId);
  }

  private show(rootId: string, reason: string | null): void {
    const root = this.env.roots.find(rootId);
    if (root?.state !== 'ready' || root.stateReason === reason) return;
    this.env.roots.update(rootId, { stateReason: reason });
  }
}
