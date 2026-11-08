import type { IgnoreMatcher, SyncHubMessage } from '@smarteverything/domain/drive-sync';
import { messageOf, type Logger } from '@smarteverything/logging';
import type { BlockHasher } from './blocks.js';
import type { BlockUploader } from './block-upload.js';
import { ConflictResolver, type ConflictResult } from './conflicts.js';
import type { DriveSyncDatabase } from './db/index.js';
import { HubMoves } from './engine-moves.js';
import { TreeScanner, dirtySourceOf } from './engine-scan.js';
import { DirtyTracker, type DirtySink, type RescanReason } from './dirty.js';
import { RootPuller, type PullProgress, type PullSink } from './pull.js';
import type { PushIntent } from './push-intents.js';
import { RootPusher, type PushAccepted, type PushSink } from './push.js';
import type { ScanSkip } from './scan.js';
import { Pins, Placeholders, Selection, wantsFrom, type SelectionApplied } from './select.js';
import type { SyncEnginePort, SyncWaiting } from './service.js';
import type { RootHello, SyncRootBinding, SyncSocket, SyncSocketSink } from './socket.js';
import type { BlockSource } from './transfer.js';
import { startWatch, type WatchStart } from './watch.js';

export type EngineState = 'stopped' | 'running' | 'paused';

export type EngineSocket = Pick<SyncSocket, 'attach' | 'detach' | 'send'>;

export interface EngineTimings {
  readonly changeQuietMs: number;
  readonly deleteHoldMs: number;
  readonly queueLimit: number | null;
  readonly writeQuietMs: number;
}

export interface EngineSink {
  readonly pushed: (result: PushAccepted) => void;
  readonly pulled: PullSink['pulled'];
  readonly contended: PullSink['contended'];
  readonly progress: (progress: PullProgress) => void;
  readonly blocked: PullSink['blocked'];
  readonly conflict: (result: ConflictResult) => void;
  readonly skipped: (skips: readonly ScanSkip[]) => void;
  readonly failed: (failure: { readonly relPath: string | null; readonly message: string }) => void;
}

export interface EngineOptions {
  readonly rootId: string;
  readonly rootPath: string;
  readonly platform: NodeJS.Platform;
  readonly portablePaths: boolean;
  readonly database: DriveSyncDatabase;
  readonly socket: EngineSocket;
  readonly hasher: BlockHasher;
  readonly source: BlockSource;
  readonly uploader: BlockUploader;
  readonly ignore: IgnoreMatcher;
  readonly timings: EngineTimings;
  readonly sink: EngineSink;
  readonly log: Logger;
}

export class DriveSyncEngine implements Pick<SyncEnginePort, 'waiting'> {
  readonly selection: Selection;
  readonly pins: Pins;
  readonly sink: SyncSocketSink;
  readonly #options: EngineOptions;
  readonly #binding: SyncRootBinding;
  readonly #pusher: RootPusher;
  readonly #puller: RootPuller;
  readonly #placeholders: Placeholders;
  readonly #resolver: ConflictResolver;
  readonly #scanner: TreeScanner;
  readonly #moves: HubMoves;
  readonly #seen = new Map<string, Set<string>>();
  #state: EngineState = 'stopped';
  #tracker: DirtyTracker | null = null;
  #watch: Extract<WatchStart, { readonly ok: true }> | null = null;
  #queue: Promise<void> = Promise.resolve();
  #inbox: Promise<void> = Promise.resolve();

  constructor(options: EngineOptions) {
    this.#options = options;
    const { database, rootId, rootPath, platform, log } = options;
    this.selection = new Selection(database, rootId);
    this.pins = new Pins(database, rootId);
    this.#binding = { rootId, hello: (): RootHello => this.#puller.hello() };
    this.#placeholders = new Placeholders({ database, rootId, rootPath, platform, log });
    this.#pusher = new RootPusher({
      rootId,
      rootPath,
      database,
      channel: { send: (message): Promise<void> => options.socket.send(rootId, message) },
      uploader: options.uploader,
      sink: this.#pushSink(),
      log,
    });
    this.#puller = new RootPuller({
      rootId,
      rootPath,
      platform,
      database,
      source: options.source,
      wants: this.selection.wants,
      sink: this.#pullSink(),
      log,
    });
    this.#resolver = this.#makeResolver();
    this.#scanner = this.#makeScanner();
    this.#moves = new HubMoves({ rootId, rootPath, platform, database, log });
    this.sink = this.#socketSink();
  }

  get state(): EngineState {
    return this.#state;
  }

  async start(): Promise<void> {
    if (this.#state === 'running') return;
    this.#state = 'running';
    try {
      await this.#open();
    } catch (cause) {
      this.#state = 'stopped';
      this.#close();
      throw cause;
    }
  }

  resume(): Promise<void> {
    return this.#state === 'paused' ? this.start() : Promise.resolve();
  }

  async pause(): Promise<void> {
    if (this.#state !== 'running') return;
    this.#state = 'paused';
    await this.#halt();
  }

  async stop(): Promise<void> {
    if (this.#state === 'stopped') return;
    this.#state = 'stopped';
    await this.#halt();
  }

  rescan(): Promise<void> {
    this.#tracker?.requestRescan('requested');
    return this.#queue;
  }

  waiting(): Promise<SyncWaiting> {
    return Promise.resolve(this.#pusher.waiting());
  }

  previewSelection(paths: readonly string[]): number {
    return this.#placeholders.downloadBytes(wantsFrom(paths));
  }

  setSelection(paths: readonly string[]): Promise<SelectionApplied> {
    return this.#run(async () => {
      this.selection.replace(paths);
      const kept = await this.#placeholders.evict(this.selection.wants);
      const released = this.#placeholders.release(this.selection.wants);
      if (released > 0) this.#resync();
      return { kept, released };
    });
  }

  #makeResolver(): ConflictResolver {
    const { rootId, rootPath, platform, database, log } = this.#options;
    return new ConflictResolver({
      rootId,
      rootPath,
      platform,
      database,
      reindex: (): void => {
        this.#resync();
      },
      submit: (intents): Promise<void> => this.#pusher.submit(intents),
      log,
    });
  }

  #makeScanner(): TreeScanner {
    const { rootId, rootPath, platform, database, log } = this.#options;
    return new TreeScanner({
      rootId,
      rootPath,
      platform,
      portablePaths: this.#options.portablePaths,
      database,
      hasher: this.#options.hasher,
      ignore: this.#options.ignore,
      writeQuietMs: this.#options.timings.writeQuietMs,
      settled: (): Promise<void> => this.#puller.settled(),
      skipped: (skips): void => {
        this.#skipped(skips);
      },
      log,
    });
  }

  #pushSink(): PushSink {
    const { sink } = this.#options;
    return {
      accepted: sink.pushed,
      conflicted: (conflict): void => {
        this.#enqueue(async () => {
          sink.conflict(await this.#resolver.resolve(conflict));
        });
      },
      stale: (): void => {
        this.#enqueue(() => this.#scan());
      },
      failed: sink.failed,
    };
  }

  #pullSink(): PullSink {
    const { sink, log, rootId } = this.#options;
    return {
      pulled: sink.pulled,
      contended: sink.contended,
      deferred: (relPath): void => {
        log.debug('drive_sync.engine.deferred', { rootId, relPath });
      },
      progress: sink.progress,
      blocked: sink.blocked,
      failed: sink.failed,
    };
  }

  #socketSink(): SyncSocketSink {
    const { rootId } = this.#options;
    return {
      opened: (id): void => {
        if (id === rootId) this.#opened();
      },
      message: (id, message): void => {
        if (id === rootId) this.#received(message);
      },
      closed: (id): void => {
        if (id === rootId) this.#pusher.interrupted();
      },
    };
  }

  async #open(): Promise<void> {
    const { rootPath, timings, log } = this.#options;
    await this.#scanner.prepare();
    this.#tracker = new DirtyTracker(dirtySourceOf(this.#options), this.#dirtySink(), {
      changeQuietMs: timings.changeQuietMs,
      deleteHoldMs: timings.deleteHoldMs,
      queueLimit: timings.queueLimit,
    });
    const watching = startWatch(rootPath, {
      tracker: this.#tracker,
      onFailure: (failure): void => {
        log.warn('drive_sync.engine.watch_failed', { error: messageOf(failure.error) });
        this.#options.sink.failed({ relPath: null, message: messageOf(failure.error) });
      },
    });
    if (!watching.ok) throw watching.failure.error;
    this.#watch = watching;
    await this.#run(() => this.#scan());
    this.#options.socket.attach(this.#binding);
  }

  async #halt(): Promise<void> {
    this.#close();
    this.#pusher.interrupted();
    await this.#queue;
  }

  #close(): void {
    this.#tracker?.close();
    this.#tracker = null;
    this.#watch?.close();
    this.#watch = null;
    this.#options.socket.detach(this.#options.rootId);
  }

  #dirtySink(): DirtySink {
    return {
      batch: (batch): void => {
        this.#enqueue(async () => {
          await this.#submit(await this.#scanner.batch(batch));
        });
      },
      rescan: (reason: RescanReason): void => {
        this.#options.log.info('drive_sync.engine.rescan', {
          rootId: this.#options.rootId,
          reason,
        });
        this.#enqueue(async () => {
          await this.#scan();
          this.#tracker?.rescanFinished();
        });
      },
      failure: (error): void => {
        this.#options.log.warn('drive_sync.engine.watch_batch_failed', {
          error: messageOf(error),
        });
        this.#options.sink.failed({ relPath: null, message: messageOf(error) });
      },
    };
  }

  #enqueue(work: () => Promise<void>): void {
    this.#queue = this.#queue.then(work).catch((cause: unknown) => {
      this.#failed(cause);
    });
  }

  #run<T>(work: () => Promise<T>): Promise<T> {
    const result = this.#queue.then(work);
    this.#queue = result.then(
      () => undefined,
      (cause: unknown) => {
        this.#failed(cause);
      },
    );
    return result;
  }

  #failed(cause: unknown): void {
    this.#options.log.error('drive_sync.engine.job_failed', cause);
    this.#options.sink.failed({ relPath: null, message: messageOf(cause) });
  }

  #opened(): void {
    this.#puller.reopened();
    this.#pusher.resume().catch((cause: unknown) => {
      this.#options.log.error('drive_sync.engine.resume_failed', cause);
    });
  }

  #received(message: SyncHubMessage): void {
    if (message.type === 'index' || message.type === 'index_update') {
      this.#inbox = this.#inbox
        .then(() => this.#ingest(message))
        .catch((cause: unknown) => {
          this.#failed(cause);
        });
      return;
    }
    this.#pusher.receive(message);
  }

  async #ingest(
    message: Extract<SyncHubMessage, { readonly type: 'index' | 'index_update' }>,
  ): Promise<void> {
    await this.#moves.apply(message.entries);
    this.#placeholders.mirror(message.entries, this.selection.wants);
    if (message.type === 'index') this.#trackIndex(message);
    this.#puller.receive(message);
  }

  #trackIndex(message: Extract<SyncHubMessage, { readonly type: 'index' }>): void {
    const seen = this.#seen.get(message.indexId) ?? new Set<string>();
    this.#seen.set(message.indexId, seen);
    for (const entry of message.entries) seen.add(entry.relPath);
    if (!message.last) return;
    this.#seen.delete(message.indexId);
    this.#puller
      .settled()
      .then(() => {
        this.#placeholders.forget(seen);
      })
      .catch((cause: unknown) => {
        this.#options.log.error('drive_sync.engine.forget_failed', cause);
      });
  }

  #resync(): void {
    const { database, rootId, socket } = this.#options;
    database.cursors.remove(rootId);
    if (this.#state !== 'running') return;
    this.#pusher.interrupted();
    socket.detach(rootId);
    socket.attach(this.#binding);
  }

  #skipped(skips: readonly ScanSkip[]): void {
    this.#options.sink.skipped(skips);
    for (const skip of skips) {
      if (skip.reason === 'recently_modified' || skip.reason === 'changed_during_hash') {
        this.#tracker?.mark(skip.relPath);
      }
    }
  }

  async #submit(intents: readonly PushIntent[]): Promise<void> {
    if (intents.length > 0) await this.#pusher.submit(intents);
  }

  async #scan(): Promise<void> {
    await this.#submit(await this.#scanner.full());
  }
}
