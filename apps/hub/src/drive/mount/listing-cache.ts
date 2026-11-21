import type { RequestMeta } from '@smarteverything/domain/drive-mount';
import { driveAccess } from '../access';
import type { PosixScope } from '../posix/env';
import type { DirectoryPage } from '../posix/reads';

interface Entry {
  readonly key: string;
  readonly rootId: string;
  readonly seq: number;
  readonly page: DirectoryPage;
}

export class ListingCache {
  private readonly entries = new Map<string, Entry>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly byRoot = new Map<string, Set<string>>();
  private readonly generations = new Map<string, number>();

  constructor(private seconds: number) {}

  private generationOf(rootId: string): number {
    return this.generations.get(rootId) ?? 0;
  }

  setSeconds(seconds: number): void {
    this.seconds = seconds;
    if (seconds === 0) {
      this.clear();
      return;
    }
    for (const entry of this.entries.values()) this.arm(entry);
  }

  get size(): number {
    return this.entries.size;
  }

  async page(
    scope: PosixScope,
    request: RequestMeta<'READDIR'>,
    load: () => Promise<DirectoryPage>,
  ): Promise<DirectoryPage> {
    if (this.seconds === 0 || driveAccess(scope.caller, scope.drive) === 'none') return load();
    const rootId = scope.drive.id;
    const key = `${scope.placementId}\0${scope.caller.lockedFolder ?? 'closed'}\0${String(request.ino)}\0${String(request.cursor)}`;
    const seq = this.generationOf(rootId);
    const known = this.entries.get(key);
    if (known !== undefined) {
      if (known.seq === seq) {
        this.arm(known);
        return known.page;
      }
      this.drop(known);
    }
    const page = await load();
    this.store({ key, rootId, seq, page });
    return page;
  }

  invalidateRoot(rootId: string): void {
    this.generations.set(rootId, this.generationOf(rootId) + 1);
    const keys = this.byRoot.get(rootId);
    if (keys === undefined) return;
    for (const key of [...keys]) {
      const entry = this.entries.get(key);
      if (entry !== undefined) this.drop(entry);
    }
  }

  clear(): void {
    for (const entry of [...this.entries.values()]) this.drop(entry);
  }

  private store(entry: Entry): void {
    const previous = this.entries.get(entry.key);
    if (previous !== undefined) this.drop(previous);
    this.entries.set(entry.key, entry);
    const keys = this.byRoot.get(entry.rootId) ?? new Set<string>();
    keys.add(entry.key);
    this.byRoot.set(entry.rootId, keys);
    this.arm(entry);
  }

  private arm(entry: Entry): void {
    clearTimeout(this.timers.get(entry.key));
    const timer = setTimeout(() => {
      this.drop(entry);
    }, this.seconds * 1000);
    timer.unref();
    this.timers.set(entry.key, timer);
  }

  private drop(entry: Entry): void {
    clearTimeout(this.timers.get(entry.key));
    this.timers.delete(entry.key);
    if (this.entries.get(entry.key) === entry) this.entries.delete(entry.key);
    const keys = this.byRoot.get(entry.rootId);
    keys?.delete(entry.key);
    if (keys?.size === 0) this.byRoot.delete(entry.rootId);
  }
}
