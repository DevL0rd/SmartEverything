import type { ModelSpec } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import {
  bakeKeyHash,
  type BakeCache,
  type BakeFailure,
  type BakeKey,
  type BakeRequest,
  type BakeResult,
  type BakedImage,
  type BakesInUse,
  type StoredBake,
} from './bake-protocol';

const log = new Logger('app.models');

export type BakePriority = 'screen' | 'page';

export type BakeOutcome =
  | { readonly kind: 'baked'; readonly bake: StoredBake }
  | { readonly kind: 'failed'; readonly reason: BakeFailure; readonly detail: string };

export type BakeListener = (outcome: BakeOutcome) => void;

export interface BakeJob {
  readonly key: BakeKey;
  readonly spec: ModelSpec;
  readonly screen: string;
  readonly priority: BakePriority;
}

export interface BakeTicket {
  readonly setPriority: (priority: BakePriority) => void;
  readonly release: () => void;
}

export interface BakeQueue {
  readonly want: (job: BakeJob, listener: BakeListener) => BakeTicket;
  readonly pruneOnce: (inUse: () => BakesInUse | null) => void;
}

export interface BakeQueueDeps {
  readonly cache: BakeCache;
  readonly bake: (request: BakeRequest) => Promise<BakeResult>;
  readonly now?: () => number;
}

interface Holder {
  readonly screen: string;
  readonly listener: BakeListener;
  priority: BakePriority;
}

type EntryState = 'reading' | 'waiting' | 'baking' | 'done';

interface Entry {
  readonly hash: string;
  readonly key: BakeKey;
  readonly spec: ModelSpec;
  readonly seq: number;
  readonly holders: Set<Holder>;
}

export function bitmapBytes(image: BakedImage): number {
  const pixels = (width: number, height: number): number =>
    Math.round(width * image.dpr) * Math.round(height * image.dpr) * 4;
  if (image.kind === 'clip') {
    return pixels(image.rect.width, image.rect.height) * image.columns * image.rows;
  }
  return image.layers.reduce((sum, layer) => sum + pixels(layer.rect.width, layer.rect.height), 0);
}

function rank(entry: Entry): number {
  return [...entry.holders].some((holder) => holder.priority === 'screen') ? 0 : 1;
}

export function nextEntry(
  entries: Iterable<Entry>,
  waiting: (entry: Entry) => boolean,
): Entry | null {
  let best: Entry | null = null;
  for (const entry of entries) {
    if (!waiting(entry) || entry.holders.size === 0) continue;
    if (
      best === null ||
      rank(entry) < rank(best) ||
      (rank(entry) === rank(best) && entry.seq < best.seq)
    ) {
      best = entry;
    }
  }
  return best;
}

class Queue implements BakeQueue {
  private readonly entries = new Map<string, Entry>();
  private readonly states = new Map<string, EntryState>();
  private readonly outcomes = new Map<string, BakeOutcome>();
  private readonly shownBytes = new Map<string, number>();
  private baking = false;
  private pruned = false;
  private seq = 0;

  constructor(private readonly deps: BakeQueueDeps) {}

  want(job: BakeJob, listener: BakeListener): BakeTicket {
    const hash = bakeKeyHash(job.key);
    const entry = this.entries.get(hash) ?? this.open(hash, job);
    const holder: Holder = { screen: job.screen, listener, priority: job.priority };
    entry.holders.add(holder);
    const outcome = this.outcomes.get(hash);
    if (outcome !== undefined) listener(outcome);
    this.measure(job.screen);
    return {
      setPriority: (priority): void => {
        holder.priority = priority;
        this.measure(holder.screen);
        this.pump();
      },
      release: (): void => {
        entry.holders.delete(holder);
        if (entry.holders.size === 0 && this.states.get(hash) !== 'baking') this.forget(hash);
        this.measure(holder.screen);
      },
    };
  }

  pruneOnce(inUse: () => BakesInUse | null): void {
    if (this.pruned) return;
    const used = inUse();
    if (used === null) return;
    this.pruned = true;
    background(this.prune(used), 'model.bake_prune_failed');
  }

  private async prune(inUse: BakesInUse): Promise<void> {
    const removed = await this.deps.cache.prune(inUse);
    log.info('model.bake_pruned', { removed });
  }

  private open(hash: string, job: BakeJob): Entry {
    this.seq += 1;
    const entry: Entry = {
      hash,
      key: job.key,
      spec: job.spec,
      seq: this.seq,
      holders: new Set(),
    };
    this.entries.set(hash, entry);
    this.states.set(hash, 'reading');
    background(this.lookUp(entry), 'model.bake_lookup_failed');
    return entry;
  }

  private async lookUp(entry: Entry): Promise<void> {
    const stored = await this.deps.cache.read(entry.key).catch((error: unknown) => {
      log.warn('model.bake_cache_read_failed', { hash: entry.hash, error: String(error) });
      return null;
    });
    if (this.entries.get(entry.hash) !== entry) return;
    if (stored !== null) {
      this.land(entry, { kind: 'baked', bake: stored });
      return;
    }
    this.states.set(entry.hash, 'waiting');
    log.info('model.bake_waiting', {
      hash: entry.hash,
      view: entry.key.view,
      holders: entry.holders.size,
    });
    this.pump();
  }

  private pump(): void {
    if (this.baking) return;
    const entry = nextEntry(this.entries.values(), (e) => this.states.get(e.hash) === 'waiting');
    if (entry === null) return;
    this.baking = true;
    this.states.set(entry.hash, 'baking');
    background(
      this.run(entry).finally(() => {
        this.baking = false;
        if (entry.holders.size === 0) this.forget(entry.hash);
        this.pump();
      }),
      'model.bake_run_failed',
    );
  }

  private async run(entry: Entry): Promise<void> {
    try {
      await this.attempt(entry);
    } catch (error: unknown) {
      const detail = String(error);
      log.warn('model.bake_failed', { hash: entry.hash, reason: 'render', detail });
      this.land(entry, { kind: 'failed', reason: 'render', detail });
    }
  }

  private async attempt(entry: Entry): Promise<void> {
    const started = (this.deps.now ?? Date.now)();
    const result = await this.deps.bake({
      id: `bake-${String(entry.seq)}`,
      key: entry.key,
      spec: entry.spec,
    });
    if (result.kind === 'failed') {
      log.warn('model.bake_failed', {
        hash: entry.hash,
        reason: result.reason,
        detail: result.detail,
      });
      this.land(entry, { kind: 'failed', reason: result.reason, detail: result.detail });
      return;
    }
    const bake = await this.deps.cache.write(entry.key, result);
    const ms = (this.deps.now ?? Date.now)() - started;
    log.info('model.bake_done', {
      hash: entry.hash,
      kind: result.kind,
      ms,
      bakeMs: result.ms,
      bytes: bitmapBytes(result),
    });
    this.land(entry, { kind: 'baked', bake });
  }

  private land(entry: Entry, outcome: BakeOutcome): void {
    this.states.set(entry.hash, 'done');
    this.outcomes.set(entry.hash, outcome);
    for (const holder of entry.holders) holder.listener(outcome);
    for (const screen of new Set([...entry.holders].map((holder) => holder.screen)))
      this.measure(screen);
  }

  private forget(hash: string): void {
    this.entries.delete(hash);
    this.states.delete(hash);
    this.outcomes.delete(hash);
  }

  private measure(screen: string): void {
    let bytes = 0;
    let images = 0;
    for (const entry of this.entries.values()) {
      const outcome = this.outcomes.get(entry.hash);
      if (outcome?.kind !== 'baked') continue;
      const shown = [...entry.holders].some((h) => h.screen === screen && h.priority === 'screen');
      if (!shown) continue;
      bytes += bitmapBytes(outcome.bake.image);
      images += 1;
    }
    if (this.shownBytes.get(screen) === bytes) return;
    this.shownBytes.set(screen, bytes);
    log.info('model.bitmap_bytes', { screen, bytes, images });
  }
}

export function createBakeQueue(deps: BakeQueueDeps): BakeQueue {
  return new Queue(deps);
}
