import { watch as fsWatch, type Dirent } from 'node:fs';
import { lstat, readdir, stat } from 'node:fs/promises';
import { join, matchesGlob } from 'node:path';
import type { StoredDrive } from '../store/repositories/drive-roots';
import { background, type Logger } from '@smarteverything/logging';
import { fsCode } from '../fs-code';
import { MARKER_DIRECTORY } from './root-marker';
import { LOCKED_FOLDER } from './access';
import { ORPHAN_DIRECTORY } from './paths';
import type { DriveActivity } from './activity';
import type { ScanPort } from './scan-port';
import { outsideOf, type IndexReader, type OutsideChange } from './watch-reflect';

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
  readonly roots: Pick<ScanPort, 'root' | 'update'>;
  readonly index: IndexReader;
  readonly activity: DriveActivity;
  readonly mounted: (rootId: string) => Promise<boolean>;
  readonly onPlacementChange: (listener: (rootId: string) => void) => () => void;
  readonly enqueueScan: (rootId: string) => void;
  readonly enqueueReflect: (rootId: string, relPaths: readonly string[]) => void;
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

async function folderInode(path: string, root: string): Promise<number | undefined> {
  try {
    const stats = path === root ? await stat(path) : await lstat(path);
    return stats.isDirectory() ? stats.ino : undefined;
  } catch (cause) {
    if (fsCode(cause) === 'ENOENT') return undefined;
    throw cause;
  }
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
  private unknown = new Set<string>();
  private opened = false;
  private mounted = false;
  private mountedTurn = 0;
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
    this.unsubscribe = env.onPlacementChange((rootId) => {
      if (rootId !== root.id) return;
      background(this.readMounted(), 'drive.watch_mounted_failed', { rootId });
    });
  }

  private async readMounted(): Promise<void> {
    this.mountedTurn += 1;
    const turn = this.mountedTurn;
    const mounted = await this.env.mounted(this.root.id);
    if (turn === this.mountedTurn) this.mounted = mounted;
  }

  async open(): Promise<void> {
    await this.readMounted();
    await this.attach(this.root.path);
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

  private async attach(directory: string): Promise<void> {
    if (this.closed || this.exhausted || this.watched.has(directory)) return;
    try {
      const ino = await folderInode(directory, this.root.path);
      if (ino === undefined || this.stopped() || this.watched.has(directory)) return;
      this.add(directory, ino);
      for (const child of await readdir(directory, { withFileTypes: true }))
        await this.child(child);
    } catch (cause) {
      this.refused(directory, cause);
    }
  }

  private async child(entry: Dirent): Promise<void> {
    const absolute = join(entry.parentPath, entry.name);
    if (this.opened) this.touch(this.relOf(absolute));
    if (entry.isDirectory()) await this.attach(absolute);
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

  private async follow(absolute: string): Promise<void> {
    let ino: number | undefined;
    try {
      ino = await folderInode(absolute, this.root.path);
    } catch (cause) {
      this.refused(absolute, cause);
      return;
    }
    if (this.closed) return;
    const known = this.watched.get(absolute);
    if (known !== undefined && known.ino !== ino) this.detach(absolute);
    if (ino !== undefined) await this.attach(absolute);
  }

  private changed(base: string, name: string): void {
    if (this.closed) return;
    if (name === '') {
      const relPath = this.relOf(base);
      if (this.ignored(relPath)) return;
      this.unknown.add(relPath);
      this.arm();
      return;
    }
    const absolute = join(base, name);
    const relPath = this.relOf(absolute);
    if (this.ignored(relPath)) return;
    background(this.follow(absolute), 'drive.watch_follow_crashed', { rootId: this.root.id });
    this.touch(relPath);
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
    this.unknown = new Set();
    if (unknown.size > 0) {
      this.env.log.info('drive.watch_unnamed_change', {
        rootId: this.root.id,
        folders: unknown.size,
      });
      this.env.enqueueReflect(this.root.id, [...unknown, ...touched]);
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
      if (outside.length === 0) {
        this.env.enqueueFollowUps(this.root.id);
        return;
      }
      if (activity.quietSince(generation)) {
        this.reflect(outside);
        return;
      }
      remaining = outside.map((change) => change.relPath);
    }
  }

  private reflect(outside: readonly OutsideChange[]): void {
    const [first] = outside;
    this.env.log.info('drive.watch_outside_change', {
      rootId: this.root.id,
      paths: outside.length,
      ...first,
    });
    this.env.enqueueReflect(
      this.root.id,
      outside.map((change) => change.relPath),
    );
  }

  private stopped(): boolean {
    return this.closed;
  }

  private async outside(touched: readonly string[]): Promise<OutsideChange[] | 'failed'> {
    try {
      return await outsideOf(this.env.index, this.root, touched);
    } catch (cause) {
      this.env.log.error('drive.watch_check_failed', cause, { rootId: this.root.id });
      this.env.enqueueReflect(this.root.id, touched);
      return 'failed';
    }
  }
}

export class DriveWatchers {
  private readonly watches = new Map<string, RootWatch>();
  private shows: Promise<void> = Promise.resolve();

  constructor(private readonly env: WatchEnvironment) {}

  start(root: StoredDrive): Promise<void> {
    this.stop(root.id);
    const watch = new RootWatch(this.env, root, (reason) => {
      this.show(root.id, reason);
    });
    this.watches.set(root.id, watch);
    return this.opened(root.id, watch);
  }

  private async opened(rootId: string, watch: RootWatch): Promise<void> {
    await watch.open();
    if (this.watches.get(rootId) !== watch) return;
    this.show(rootId, watch.reason);
    await this.shows;
    this.env.enqueueScan(rootId);
  }

  async remounted(rootId: string): Promise<void> {
    const root = await this.env.roots.root(rootId);
    if (root === undefined) {
      this.stop(rootId);
      return;
    }
    await this.start(root);
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

  idle(): Promise<void> {
    return this.shows;
  }

  private show(rootId: string, reason: string | null): void {
    this.shows = this.shows
      .then(() => this.shown(rootId, reason))
      .catch((cause: unknown) => {
        this.env.log.error('drive.watch_reason_failed', cause, { rootId });
      });
  }

  private async shown(rootId: string, reason: string | null): Promise<void> {
    const root = await this.env.roots.root(rootId);
    if (root?.state !== 'ready' || root.stateReason === reason) return;
    await this.env.roots.update(rootId, { stateReason: reason });
  }
}
