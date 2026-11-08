import { appendTo } from '@smarteverything/domain';

export type EntryKind = 'file' | 'folder' | 'other';

export interface EntryIdentity {
  readonly kind: EntryKind;
  readonly bytes: number;
  readonly mtimeNs: bigint;
}

export interface DirtySource {
  readonly probe: (path: string) => Promise<EntryIdentity | undefined>;
  readonly known: (path: string) => EntryIdentity | undefined;
  readonly isIgnored: (path: string) => boolean;
}

export type RescanReason =
  'overflow' | 'watcher_error' | 'unknown_path' | 'probe_failed' | 'requested';

export interface RenamedEntry {
  readonly from: string;
  readonly to: string;
  readonly kind: EntryKind;
}

export interface DirtyBatch {
  readonly renames: readonly RenamedEntry[];
  readonly changed: readonly string[];
  readonly deleted: readonly string[];
}

export interface DirtySink {
  readonly batch: (batch: DirtyBatch) => void;
  readonly rescan: (reason: RescanReason) => void;
  readonly failure: (error: Error) => void;
}

export interface DirtyTimings {
  readonly changeQuietMs: number;
  readonly deleteHoldMs: number;
  readonly queueLimit: number | null;
}

export type WatchState = 'watching' | 'rescanning';

export interface HeldDelete {
  readonly identity: EntryIdentity;
  readonly since: number;
}

interface Classified {
  readonly creates: ReadonlyMap<string, EntryIdentity>;
  readonly changed: readonly string[];
}

function identityKey(identity: EntryIdentity): string | undefined {
  return identity.kind === 'other'
    ? undefined
    : `${identity.kind}:${String(identity.bytes)}:${String(identity.mtimeNs)}`;
}

function groupByKey<T>(
  entries: Iterable<readonly [string, T]>,
  identityOf: (value: T) => EntryIdentity,
): ReadonlyMap<string, readonly string[]> {
  const groups = new Map<string, string[]>();
  for (const [path, value] of entries) {
    const key = identityKey(identityOf(value));
    if (key !== undefined) appendTo(groups, key, path);
  }
  return groups;
}

export function pairRenames(
  creates: ReadonlyMap<string, EntryIdentity>,
  held: ReadonlyMap<string, HeldDelete>,
): readonly RenamedEntry[] {
  const createGroups = groupByKey(creates, (identity) => identity);
  const heldGroups = groupByKey(held, (entry) => entry.identity);
  const renames: RenamedEntry[] = [];
  for (const [key, targets] of createGroups) {
    const sources = heldGroups.get(key);
    const [to] = targets;
    const from = sources?.[0];
    const identity = to === undefined ? undefined : creates.get(to);
    if (
      targets.length === 1 &&
      sources?.length === 1 &&
      to !== undefined &&
      from !== undefined &&
      identity !== undefined
    ) {
      renames.push({ from, to, kind: identity.kind });
    }
  }
  return renames;
}

export function withoutDescendants(paths: readonly string[]): readonly string[] {
  const all = new Set(paths);
  return paths.filter((path) => {
    for (let at = path.lastIndexOf('/'); at > 0; at = path.lastIndexOf('/', at - 1)) {
      if (all.has(path.slice(0, at))) return false;
    }
    return true;
  });
}

function isInside(path: string, folder: string): boolean {
  return path.startsWith(`${folder}/`);
}

export class DirtyTracker {
  readonly #source: DirtySource;
  readonly #sink: DirtySink;
  readonly #timings: DirtyTimings;
  readonly #dirty = new Set<string>();
  readonly #held = new Map<string, HeldDelete>();
  #events = 0;
  #quiet: ReturnType<typeof setTimeout> | undefined;
  #release: ReturnType<typeof setTimeout> | undefined;
  #state: WatchState = 'watching';
  #queued: RescanReason | undefined;
  #epoch = 0;
  #closed = false;
  #queue: Promise<void> = Promise.resolve();

  constructor(source: DirtySource, sink: DirtySink, timings: DirtyTimings) {
    this.#source = source;
    this.#sink = sink;
    this.#timings = timings;
  }

  get state(): WatchState {
    return this.#state;
  }

  mark(path: string): void {
    if (this.#closed) return;
    this.#events += 1;
    if (this.#source.isIgnored(path)) return;
    this.#dirty.add(path);
    this.#armQuiet();
  }

  markUnknown(): void {
    this.requestRescan('unknown_path');
  }

  fail(reason: Extract<RescanReason, 'watcher_error'>): void {
    this.requestRescan(reason);
  }

  requestRescan(reason: RescanReason): void {
    if (this.#closed) return;
    if (this.#state === 'rescanning') {
      this.#queued = reason;
      return;
    }
    this.#startRescan(reason);
  }

  rescanFinished(): void {
    if (this.#closed || this.#state !== 'rescanning') return;
    this.#state = 'watching';
    const queued = this.#queued;
    this.#queued = undefined;
    if (queued !== undefined) {
      this.#startRescan(queued);
      return;
    }
    if (this.#dirty.size > 0) this.#armQuiet();
  }

  close(): void {
    this.#closed = true;
    this.#epoch += 1;
    this.#clearTimers();
    this.#dirty.clear();
    this.#held.clear();
  }

  #startRescan(reason: RescanReason): void {
    this.#epoch += 1;
    this.#clearTimers();
    this.#dirty.clear();
    this.#held.clear();
    this.#events = 0;
    this.#state = 'rescanning';
    this.#sink.rescan(reason);
  }

  #clearTimers(): void {
    clearTimeout(this.#quiet);
    clearTimeout(this.#release);
    this.#quiet = undefined;
    this.#release = undefined;
  }

  #armQuiet(): void {
    if (this.#state === 'rescanning') return;
    clearTimeout(this.#quiet);
    this.#quiet = setTimeout(() => {
      this.#quiet = undefined;
      this.#enqueue(() => this.#flush());
    }, this.#timings.changeQuietMs);
  }

  #armRelease(): void {
    clearTimeout(this.#release);
    this.#release = undefined;
    const sinces = [...this.#held.values()].map((entry) => entry.since);
    if (sinces.length === 0) return;
    const wait = Math.max(0, Math.min(...sinces) + this.#timings.deleteHoldMs - performance.now());
    this.#release = setTimeout(() => {
      this.#release = undefined;
      this.#enqueue(() => {
        this.#releaseDue();
      });
    }, wait);
  }

  #enqueue(work: () => Promise<void> | void): void {
    this.#queue = this.#queue.then(work).catch((error: unknown) => {
      this.#sink.failure(error instanceof Error ? error : new Error(String(error)));
    });
  }

  async #flush(): Promise<void> {
    if (this.#closed || this.#state === 'rescanning') return;
    const paths = [...this.#dirty];
    this.#dirty.clear();
    const burst = this.#events;
    this.#events = 0;
    const { queueLimit } = this.#timings;
    if (queueLimit !== null && burst >= queueLimit) {
      this.#startRescan('overflow');
      return;
    }
    const epoch = this.#epoch;
    let classified: Classified;
    try {
      classified = await this.#classify(paths);
    } catch (error) {
      if (epoch !== this.#epoch) return;
      this.#sink.failure(error instanceof Error ? error : new Error(String(error)));
      this.#startRescan('probe_failed');
      return;
    }
    if (epoch !== this.#epoch) return;
    this.#publish(classified);
  }

  async #classify(paths: readonly string[]): Promise<Classified> {
    const creates = new Map<string, EntryIdentity>();
    const changed: string[] = [];
    for (const path of paths) {
      const identity = await this.#source.probe(path);
      const known = this.#source.known(path);
      if (identity === undefined) {
        if (known !== undefined)
          this.#held.set(path, { identity: known, since: performance.now() });
      } else if (known === undefined) {
        creates.set(path, identity);
      } else {
        changed.push(path);
      }
      if (identity !== undefined) this.#held.delete(path);
    }
    return { creates, changed };
  }

  #publish(classified: Classified): void {
    const renames = pairRenames(classified.creates, this.#held);
    const paired = new Set(renames.map((rename) => rename.to));
    for (const rename of renames) {
      this.#held.delete(rename.from);
      if (rename.kind === 'folder') this.#dropHeldInside(rename.from);
    }
    const changed = [
      ...classified.changed,
      ...[...classified.creates.keys()].filter((path) => !paired.has(path)),
    ];
    this.#emit({ renames, changed, deleted: this.#takeDue() });
    this.#armRelease();
  }

  #dropHeldInside(folder: string): void {
    for (const path of [...this.#held.keys()]) {
      if (isInside(path, folder)) this.#held.delete(path);
    }
  }

  #takeDue(): readonly string[] {
    const now = performance.now();
    const due = [...this.#held].filter(
      ([, entry]) => now - entry.since >= this.#timings.deleteHoldMs,
    );
    for (const [path] of due) this.#held.delete(path);
    return withoutDescendants(due.map(([path]) => path));
  }

  #releaseDue(): void {
    if (this.#closed || this.#state === 'rescanning') return;
    this.#emit({ renames: [], changed: [], deleted: this.#takeDue() });
    this.#armRelease();
  }

  #emit(batch: DirtyBatch): void {
    if (batch.renames.length + batch.changed.length + batch.deleted.length > 0) {
      this.#sink.batch(batch);
    }
  }
}
