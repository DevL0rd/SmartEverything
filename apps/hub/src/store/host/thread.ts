import { Worker } from 'node:worker_threads';
import { Logger, messageOf } from '@smarteverything/logging';
import { logRecordOf } from '../../logs/record';
import type { DriveFolders } from '../../data-layout/drive-folders';
import { HUB_VERSION } from '../../version';
import { StoreHostStoppedError, errorOfHost } from './errors';
import { FROM_HOST, type HostData, type HostEvent, type HostTarget, type ToHost } from './protocol';

export interface HostSettled {
  readonly events: readonly HostEvent[];
  readonly committed: boolean;
}

export interface HostThreadOptions {
  readonly script: string;
  readonly path: string;
  readonly driveFolders: DriveFolders | null;
  readonly busyTimeoutMs: number;
  readonly readOnly: boolean;
  readonly log: Logger;
  readonly now: () => Date;
  readonly settled: (thread: HostThread, settled: HostSettled) => void;
}

interface Waiting {
  readonly target: HostTarget;
  readonly resolve: (value: unknown) => void;
  readonly reject: (cause: Error) => void;
}

function labelOf(target: HostTarget): string {
  return target.kind === 'unit' ? target.name : target.path.join('.');
}

export class HostThread {
  private worker: Worker | null = null;
  private sequence = 0;
  private readonly waiting = new Map<number, Waiting>();
  private closed = false;

  constructor(private readonly options: HostThreadOptions) {}

  get started(): boolean {
    return this.worker !== null;
  }

  get pending(): number {
    return this.waiting.size;
  }

  get readOnly(): boolean {
    return this.options.readOnly;
  }

  call(target: HostTarget, input: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new StoreHostStoppedError('the store is closed'));
    const worker = this.running();
    this.sequence += 1;
    const id = this.sequence;
    return new Promise((resolve, reject) => {
      this.waiting.set(id, { target, resolve, reject });
      this.post(worker, {
        type: 'call',
        id,
        now: this.options.now().toISOString(),
        target,
        input,
      });
    });
  }

  committedElsewhere(): void {
    if (this.worker !== null) this.post(this.worker, { type: 'commit' });
  }

  close(): Promise<void> {
    this.closed = true;
    const worker = this.worker;
    this.worker = null;
    this.failAll(new StoreHostStoppedError('the store is closing'));
    if (worker === null) return Promise.resolve();
    return worker.terminate().then(() => undefined);
  }

  private post(worker: Worker, message: ToHost): void {
    worker.postMessage(message);
  }

  private running(): Worker {
    if (this.worker !== null) return this.worker;
    const data: HostData = {
      path: this.options.path,
      driveFolders: this.options.driveFolders,
      busyTimeoutMs: this.options.busyTimeoutMs,
      readOnly: this.options.readOnly,
      level: Logger.level,
      release: HUB_VERSION,
      now: this.options.now().toISOString(),
    };
    const worker = new Worker(this.options.script, { workerData: data });
    worker.unref();
    worker.on('message', (raw: unknown) => {
      this.received(raw);
    });
    worker.on('error', (cause) => {
      this.stopped(worker, cause);
    });
    worker.on('exit', (code) => {
      this.stopped(worker, new StoreHostStoppedError(`it exited with code ${String(code)}`));
    });
    this.worker = worker;
    this.options.log.info('store.host_started', { readOnly: this.options.readOnly });
    return worker;
  }

  private received(raw: unknown): void {
    const message = FROM_HOST.parse(raw);
    if (message.type === 'log') {
      Logger.relay(logRecordOf(message.record));
      return;
    }
    if (this.closed) return;
    const waiting = this.waiting.get(message.id);
    if (waiting === undefined)
      throw new StoreHostStoppedError(`it answered an unknown call ${String(message.id)}`);
    this.waiting.delete(message.id);
    this.options.settled(this, { events: message.events, committed: message.committed });
    if (message.type === 'reply') waiting.resolve(message.value);
    else waiting.reject(errorOfHost(message.error));
  }

  private stopped(worker: Worker, cause: unknown): void {
    if (this.worker !== worker) return;
    this.worker = null;
    if (!this.closed) this.options.log.error('store.host_stopped', cause);
    this.failAll(new StoreHostStoppedError(messageOf(cause)));
  }

  private failAll(cause: Error): void {
    const waiting = [...this.waiting.values()];
    this.waiting.clear();
    for (const entry of waiting) {
      this.options.log.debug('store.host_call_dropped', () => ({ target: labelOf(entry.target) }));
      entry.reject(cause);
    }
  }
}
