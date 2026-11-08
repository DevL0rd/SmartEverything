import { MODEL_SPEC, type ModelSpec } from '@smarteverything/domain';
import { Logger, background } from '@smarteverything/logging';
import { rawErrorText } from '../../../format/errors';
import { parseJson } from '../bake/bake-protocol';
import type { AssetCache } from './asset-cache-protocol';

const log = new Logger('app.models');

export type ModelAssetState<T> =
  | { readonly status: 'idle' }
  | { readonly status: 'loading' }
  | { readonly status: 'ready'; readonly value: T }
  | { readonly status: 'failed'; readonly detail: string };

export const ASSET_IDLE: ModelAssetState<never> = { status: 'idle' };

export const ASSET_LOADING: ModelAssetState<never> = { status: 'loading' };

export class AssetHashMismatchError extends Error {
  override readonly name = 'AssetHashMismatchError';

  constructor(
    readonly expected: string,
    readonly actual: string,
  ) {
    super(`The model file ${expected} arrived as ${actual}.`);
  }
}

export class AssetSpecError extends Error {
  override readonly name = 'AssetSpecError';

  constructor(
    readonly sha256: string,
    readonly problem: string,
  ) {
    super(`The model file ${sha256} is not a model spec: ${problem}.`);
  }
}

export interface AssetDeps {
  readonly cache: AssetCache;
  readonly fetchBytes: (sha256: string) => Promise<Uint8Array>;
  readonly digest: (bytes: Uint8Array) => Promise<string>;
}

type Listener<T> = (state: ModelAssetState<T>) => void;

class Entry<T> {
  state: ModelAssetState<T> = ASSET_LOADING;
  readonly listeners = new Set<Listener<T>>();

  settle(state: ModelAssetState<T>): void {
    this.state = state;
    for (const listener of this.listeners) listener(state);
  }
}

export class HeldAssets<T> {
  private readonly entries = new Map<string, Entry<T>>();

  constructor(private readonly load: (sha256: string) => Promise<T>) {}

  hold(sha256: string, listener: Listener<T>): () => void {
    const entry = this.entryOf(sha256);
    entry.listeners.add(listener);
    listener(entry.state);
    return (): void => {
      entry.listeners.delete(listener);
      if (entry.listeners.size === 0 && this.entries.get(sha256) === entry) {
        this.entries.delete(sha256);
      }
    };
  }

  hashes(): readonly string[] {
    return [...this.entries.keys()];
  }

  private entryOf(sha256: string): Entry<T> {
    const known = this.entries.get(sha256);
    if (known !== undefined) return known;
    const entry = new Entry<T>();
    this.entries.set(sha256, entry);
    background(this.settle(sha256, entry), 'model.asset_settle_failed', { sha256 });
    return entry;
  }

  private async settle(sha256: string, entry: Entry<T>): Promise<void> {
    const state = await this.load(sha256).then(
      (value): ModelAssetState<T> => ({ status: 'ready', value }),
      (error: unknown): ModelAssetState<T> => {
        log.warn('model.asset_failed', { sha256, detail: rawErrorText(error) });
        return { status: 'failed', detail: rawErrorText(error) };
      },
    );
    entry.settle(state);
  }
}

function specOf(sha256: string, bytes: Uint8Array): ModelSpec {
  const parsed = MODEL_SPEC.safeParse(parseJson(new TextDecoder().decode(bytes)));
  if (!parsed.success) {
    throw new AssetSpecError(sha256, parsed.error.issues[0]?.message ?? 'unreadable');
  }
  return parsed.data;
}

export class ModelAssets {
  readonly specs: HeldAssets<ModelSpec>;
  readonly files: HeldAssets<Uint8Array>;
  private readonly inflight = new Map<string, Promise<Uint8Array>>();
  private pruned = false;

  constructor(private readonly deps: AssetDeps) {
    this.specs = new HeldAssets(async (sha256) => specOf(sha256, await this.bytes(sha256)));
    this.files = new HeldAssets((sha256) => this.bytes(sha256));
  }

  bytes(sha256: string): Promise<Uint8Array> {
    const known = this.inflight.get(sha256);
    if (known !== undefined) return known;
    const read = this.read(sha256).finally(() => {
      this.inflight.delete(sha256);
    });
    this.inflight.set(sha256, read);
    return read;
  }

  pruneOnce(known: () => ReadonlySet<string> | null): void {
    if (this.pruned) return;
    const hashes = known();
    if (hashes === null) return;
    this.pruned = true;
    const keep = new Set([
      ...hashes,
      ...this.inflight.keys(),
      ...this.specs.hashes(),
      ...this.files.hashes(),
    ]);
    background(this.prune(keep), 'model.asset_prune_failed');
  }

  private async prune(keep: ReadonlySet<string>): Promise<void> {
    const removed = await this.deps.cache.prune(keep);
    if (removed > 0) log.info('model.assets_pruned', { removed });
  }

  private async read(sha256: string): Promise<Uint8Array> {
    const cached = await this.deps.cache.read(sha256);
    if (cached !== null) return cached;
    const fetched = await this.deps.fetchBytes(sha256);
    const actual = await this.deps.digest(fetched);
    if (actual !== sha256) throw new AssetHashMismatchError(sha256, actual);
    await this.store(sha256, fetched);
    return fetched;
  }

  private async store(sha256: string, bytes: Uint8Array): Promise<void> {
    try {
      await this.deps.cache.write(sha256, bytes);
    } catch (error) {
      log.warn('model.asset_cache_write_failed', { sha256, detail: rawErrorText(error) });
    }
  }
}
