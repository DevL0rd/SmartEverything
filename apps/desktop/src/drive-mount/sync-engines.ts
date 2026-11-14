import { messageOf, type Logger } from '@smarteverything/logging';
import type { SyncEnginePort, SyncTarget, SyncWaiting } from '../drive-sync/service.js';

export interface EngineHandle {
  readonly start: () => Promise<void>;
  readonly stop: () => Promise<void>;
  readonly pause: () => Promise<void>;
  readonly resume: () => Promise<void>;
  readonly waiting: () => Promise<SyncWaiting>;
  readonly failures: () => number;
}

export type EngineFactory = (target: SyncTarget, changed: () => void) => EngineHandle;

export interface SyncSummary {
  readonly placements: number;
  readonly paused: boolean;
  readonly needBytes: number;
  readonly pendingOps: number;
  readonly failures: number;
}

export interface SyncEngineHostOptions {
  readonly create: EngineFactory;
  readonly prepare: (target: SyncTarget) => Promise<void>;
  readonly quietMs: number;
  readonly log: Logger;
}

export class SyncEngineHost implements SyncEnginePort {
  private readonly running = new Map<string, EngineHandle>();
  private readonly listeners = new Set<() => void>();
  private paused = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly options: SyncEngineHostOptions) {}

  async start(target: SyncTarget): Promise<void> {
    await this.options.prepare(target);
    const handle = this.options.create(target, () => {
      this.touch();
    });
    await handle.start();
    this.running.set(target.placementId, handle);
    if (this.paused) await handle.pause();
    this.touch();
  }

  async stop(placementId: string): Promise<void> {
    const handle = this.running.get(placementId);
    if (handle === undefined) return;
    this.running.delete(placementId);
    await handle.stop();
    this.touch();
  }

  async waiting(placementId: string): Promise<SyncWaiting> {
    const handle = this.running.get(placementId);
    return handle === undefined ? { needBytes: 0, pendingOps: 0 } : handle.waiting();
  }

  async pause(): Promise<void> {
    this.paused = true;
    await this.each((handle) => handle.pause());
    this.touch();
  }

  async resume(): Promise<void> {
    this.paused = false;
    await this.each((handle) => handle.resume());
    this.touch();
  }

  async summary(): Promise<SyncSummary | null> {
    if (this.running.size === 0) return null;
    let needBytes = 0;
    let pendingOps = 0;
    let failures = 0;
    for (const handle of this.running.values()) {
      const waiting = await handle.waiting();
      needBytes += waiting.needBytes;
      pendingOps += waiting.pendingOps;
      failures += handle.failures();
    }
    return { placements: this.running.size, paused: this.paused, needBytes, pendingOps, failures };
  }

  onChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  async close(): Promise<void> {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    await this.each((handle) => handle.stop());
    this.running.clear();
  }

  private async each(work: (handle: EngineHandle) => Promise<void>): Promise<void> {
    for (const [placementId, handle] of [...this.running]) {
      try {
        await work(handle);
      } catch (cause) {
        this.options.log.error('drive_sync.host_engine_failed', cause, {
          placement_id: placementId,
          error: messageOf(cause),
        });
      }
    }
  }

  private touch(): void {
    if (this.timer !== null) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      for (const listener of this.listeners) listener();
    }, this.options.quietMs);
    this.timer.unref();
  }
}
