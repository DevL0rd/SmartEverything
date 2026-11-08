import { Worker } from 'node:worker_threads';
import type { Logger } from '@smarteverything/logging';
import { LoopHeartbeat } from './loop-heartbeat';
import {
  BEAT_SLOTS,
  BEAT_STOPPING,
  RESPAWN_MS,
  STACK_AFTER_MS,
  WATCHDOG_MESSAGE,
  WATCHDOG_TICK_MS,
  type WatchdogData,
} from './settings';

export interface LoopWatchdogOptions {
  readonly script: string;
  readonly name: string;
  readonly logPath: string;
  readonly release: string;
  readonly exitAfterMs: number;
  readonly tickMs?: number;
  readonly stackAfterMs?: number;
  readonly log: Logger;
}

export interface LoopWatchdog {
  readonly stop: () => void;
}

class Watchdog implements LoopWatchdog {
  private readonly shared = new SharedArrayBuffer(BEAT_SLOTS * Int32Array.BYTES_PER_ELEMENT);
  private readonly beat = new Int32Array(this.shared);
  private readonly heartbeat: LoopHeartbeat;
  private readonly log: Logger;
  private worker: Worker | null = null;
  private respawn: NodeJS.Timeout | null = null;
  private stopping = false;

  constructor(private readonly options: LoopWatchdogOptions) {
    this.log = options.log.forArea('hub.watchdog');
    this.heartbeat = new LoopHeartbeat(
      this.beat,
      options.tickMs ?? WATCHDOG_TICK_MS,
      options.name,
      this.log,
    );
  }

  start(): void {
    this.heartbeat.start();
    this.spawn();
  }

  stop(): void {
    this.stopping = true;
    Atomics.store(this.beat, BEAT_STOPPING, 1);
    this.heartbeat.stop();
    if (this.respawn !== null) {
      clearTimeout(this.respawn);
      this.respawn = null;
    }
    this.worker?.terminate().catch((cause: unknown) => {
      this.log.error('loop.watchdog_stop_failed', cause);
    });
    this.worker = null;
  }

  private spawn(): void {
    const data: WatchdogData = {
      beat: this.shared,
      name: this.options.name,
      logPath: this.options.logPath,
      release: this.options.release,
      tickMs: this.options.tickMs ?? WATCHDOG_TICK_MS,
      stackAfterMs: this.options.stackAfterMs ?? STACK_AFTER_MS,
      exitAfterMs: this.options.exitAfterMs,
    };
    const worker = new Worker(this.options.script, { workerData: data });
    worker.unref();
    this.worker = worker;
    worker.on('message', (raw: unknown) => {
      this.stalled(raw);
    });
    worker.on('error', (cause) => {
      this.log.error('loop.watchdog_failed', cause);
    });
    worker.on('exit', (code) => {
      this.exited(worker, code);
    });
    this.log.info('loop.watchdog_started', {
      name: this.options.name,
      exitAfterMs: this.options.exitAfterMs,
    });
  }

  private stalled(raw: unknown): void {
    const message = WATCHDOG_MESSAGE.safeParse(raw);
    if (message.success) {
      this.log.warn('loop.recovered', {
        name: this.options.name,
        stalledMs: Math.round(message.data.stalledMs),
        frames: message.data.frames,
      });
    }
  }

  private exited(worker: Worker, code: number): void {
    if (this.stopping || this.worker !== worker) {
      return;
    }
    this.worker = null;
    this.log.error('loop.watchdog_exited', undefined, {
      name: this.options.name,
      exitCode: code,
      restartInMs: RESPAWN_MS,
    });
    this.respawn = setTimeout(() => {
      this.respawn = null;
      this.spawn();
    }, RESPAWN_MS);
    this.respawn.unref();
  }
}

export function startLoopWatchdog(options: LoopWatchdogOptions): LoopWatchdog {
  const watchdog = new Watchdog(options);
  watchdog.start();
  return watchdog;
}
