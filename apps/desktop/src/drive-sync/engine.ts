import type { SyncHubMessage } from '@smarteverything/domain/drive-sync';
import { messageOf } from '@smarteverything/logging';
import { ConflictResolver } from './conflicts.js';
import { HubMoves } from './engine-moves.js';
import { TreeScanner, dirtySourceOf } from './engine-scan.js';
import { DirtyTracker, type DirtySink, type RescanReason } from './dirty.js';
import { PlacementPuller, type PullSink } from './pull.js';
import type { PushIntent } from './push-intents.js';
import { PlacementPusher, type PushSink } from './push.js';
import type { ScanSkip } from './scan.js';
import {
  Exclusions,
  Pins,
  Placeholders,
  applyExclusions,
  wantsWithout,
  type ExclusionsApplied,
} from './select.js';
import type { EngineOptions, EngineState } from './engine-types.js';
import type { SyncEnginePort, SyncWaiting } from './service.js';
import type {
  PlacementHello,
  SyncClientStateReport,
  SyncPlacementBinding,
  SyncSocketSink,
} from './socket.js';
import { StateReporter } from './state.js';
import { startWatch, type WatchStart } from './watch.js';

export type {
  EngineOptions,
  EngineSink,
  EngineSocket,
  EngineState,
  EngineTimings,
} from './engine-types.js';

export class DriveSyncEngine implements Pick<SyncEnginePort, 'waiting'> {
  readonly exclusions: Exclusions;
  readonly pins: Pins;
  readonly sink: SyncSocketSink;
  readonly #options: EngineOptions;
  readonly #binding: SyncPlacementBinding;
  readonly #pusher: PlacementPusher;
  readonly #puller: PlacementPuller;
  readonly #placeholders: Placeholders;
  readonly #resolver: ConflictResolver;
  readonly #scanner: TreeScanner;
  readonly #moves: HubMoves;
  readonly #reporter: StateReporter;
  readonly #seen = new Map<string, Set<string>>();
  #state: EngineState = 'stopped';
  #tracker: DirtyTracker | null = null;
  #watch: Extract<WatchStart, { readonly ok: true }> | null = null;
  #queue: Promise<void> = Promise.resolve();
  #inbox: Promise<void> = Promise.resolve();

  constructor(options: EngineOptions) {
    this.#options = options;
    const { database, placementId, rootPath, platform, log } = options;
    this.exclusions = new Exclusions(database, placementId);
    this.pins = new Pins(database, placementId);
    this.#binding = { placementId, hello: (): PlacementHello => this.#puller.hello() };
    this.#placeholders = new Placeholders({ database, placementId, rootPath, platform, log });
    this.#pusher = new PlacementPusher({
      placementId,
      rootPath,
      database,
      channel: { send: (message): Promise<void> => options.socket.send(placementId, message) },
      uploader: options.uploader,
      sink: this.#pushSink(),
      log,
    });
    this.#puller = new PlacementPuller({
      placementId,
      driveId: options.driveId,
      rootPath,
      platform,
      database,
      source: options.source,
      wants: this.exclusions.wants,
      sink: this.#pullSink(),
      log,
    });
    this.#resolver = this.#makeResolver();
    this.#scanner = this.#makeScanner();
    this.#moves = new HubMoves({ placementId, rootPath, platform, database, log });
    this.#reporter = new StateReporter({
      placementId,
      database,
      socket: options.socket,
      placeholders: this.#placeholders,
      wants: this.exclusions.wants,
      waiting: (): SyncWaiting => this.#pusher.waiting(),
      log,
    });
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

  previewExclusions(paths: readonly string[]): number {
    return this.#placeholders.downloadBytes(wantsWithout(paths));
  }

  setExcluded(paths: readonly string[]): Promise<ExclusionsApplied> {
    return this.#run(async () => {
      const applied = await applyExclusions(this.exclusions, this.#placeholders, paths);
      if (applied.changed) this.#resync();
      return applied;
    });
  }

  #makeResolver(): ConflictResolver {
    const { placementId, rootPath, platform, database, log } = this.#options;
    return new ConflictResolver({
      placementId,
      rootPath,
      platform,
      database,
      reindex: (): void => {
        this.#resync();
      },
      submit: (intents): Promise<void> => this.#submit(intents),
      log,
    });
  }

  #makeScanner(): TreeScanner {
    const { placementId, rootPath, platform, database, log } = this.#options;
    return new TreeScanner({
      placementId,
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
      accepted: (result): void => {
        sink.pushed(result);
        this.#reporter.resolved(result.relPath);
      },
      conflicted: (conflict): void => {
        this.#enqueue(async () => {
          sink.conflict(await this.#resolver.resolve(conflict));
        });
      },
      stale: (): void => {
        this.#enqueue(() => this.#scan());
      },
      failed: (failure): void => {
        this.#fail(failure);
      },
    };
  }

  #pullSink(): PullSink {
    const { sink, log, placementId } = this.#options;
    return {
      pulled: (result): void => {
        sink.pulled(result);
        this.#reporter.resolved(result.relPath);
      },
      contended: sink.contended,
      deferred: (relPath): void => {
        log.debug('drive_sync.engine.deferred', { placementId, relPath });
      },
      progress: sink.progress,
      blocked: sink.blocked,
      failed: (failure): void => {
        this.#fail(failure);
      },
    };
  }

  #socketSink(): SyncSocketSink {
    const { placementId } = this.#options;
    return {
      opened: (id): void => {
        if (id === placementId) this.#opened();
      },
      message: (id, message): void => {
        if (id === placementId) this.#received(message);
      },
      closed: (id): void => {
        if (id === placementId) this.#pusher.interrupted();
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
        this.#fail({ relPath: null, message: messageOf(failure.error) });
      },
    });
    if (!watching.ok) throw watching.failure.error;
    this.#watch = watching;
    await this.#run(async () => {
      const applied = await applyExclusions(
        this.exclusions,
        this.#placeholders,
        this.#options.excluded,
      );
      if (applied.changed || applied.released > 0) {
        this.#options.database.cursors.remove(this.#options.placementId);
      }
      await this.#scan();
    });
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
    this.#options.socket.detach(this.#options.placementId);
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
          placementId: this.#options.placementId,
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
        this.#fail({ relPath: null, message: messageOf(error) });
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

  stateReport(): SyncClientStateReport {
    return this.#reporter.report();
  }

  #fail(failure: { readonly relPath: string | null; readonly message: string }): void {
    this.#options.sink.failed(failure);
    this.#reporter.failed(failure);
  }

  #failed(cause: unknown): void {
    this.#options.log.error('drive_sync.engine.job_failed', cause);
    this.#fail({ relPath: null, message: messageOf(cause) });
  }

  #opened(): void {
    this.#puller.reopened();
    this.#reporter.publish();
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
    this.#placeholders.mirror(message.entries, this.exclusions.wants);
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
    const { database, placementId, socket, log } = this.#options;
    if (this.#state !== 'running') {
      database.cursors.remove(placementId);
      return;
    }
    this.#pusher.interrupted();
    socket.detach(placementId);
    this.#inbox = this.#inbox
      .then(() => this.#puller.settled())
      .then(() => {
        database.cursors.remove(placementId);
        if (this.#state === 'running') socket.attach(this.#binding);
      })
      .catch((cause: unknown) => {
        log.error('drive_sync.engine.resync_failed', cause);
      });
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
    if (this.#options.receiveOnly) return;
    if (intents.length > 0) await this.#pusher.submit(intents);
  }

  async #scan(): Promise<void> {
    await this.#submit(await this.#scanner.full());
    this.#reporter.settled();
  }
}
