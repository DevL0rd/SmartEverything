import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { HistoryColumns, NodeHello } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import { logRecordOf } from '../../logs/record';
import { FROM_METRICS, type ToMetrics } from './metrics-protocol';
import type { MetricsDeps, MetricsFactory, NodeMetrics } from './node-metrics';

export const BUNDLED_METRICS_WORKER = fileURLToPath(
  new URL('./computer-metrics.mjs', import.meta.url),
);

export class MetricsWorkerError extends Error {
  override readonly name = 'MetricsWorkerError';
}

interface Waiting<T> {
  readonly resolve: (value: T) => void;
  readonly reject: (cause: unknown) => void;
}

export interface WorkerMetricsOptions {
  readonly script: string;
  readonly machineId: string;
}

class WorkerMetrics implements NodeMetrics {
  private readonly worker: Worker;
  private readonly hellos = new Map<number, Waiting<NodeHello>>();
  private readonly columns = new Map<number, Waiting<HistoryColumns>>();
  private next = 0;
  private closed = false;

  constructor(options: WorkerMetricsOptions, deps: MetricsDeps) {
    this.worker = new Worker(options.script, {
      workerData: { machineId: options.machineId, level: Logger.level, policy: deps.policy },
    });
    this.worker.unref();
    this.worker.on('message', (raw: unknown) => {
      const message = FROM_METRICS.parse(raw);
      switch (message.type) {
        case 'frame':
          deps.emit(message.frame);
          return;
        case 'log':
          Logger.relay(logRecordOf(message.record));
          return;
        case 'hello':
          this.hellos.get(message.id)?.resolve(message.hello);
          this.hellos.delete(message.id);
          return;
        case 'backfill':
          this.columns.get(message.id)?.resolve(message.columns);
          this.columns.delete(message.id);
          return;
        case 'failed':
          this.fail(message.id, new MetricsWorkerError(message.message));
      }
    });
    this.worker.on('error', (cause) => {
      deps.log.error('node.metrics_worker_failed', cause);
      this.failAll(cause);
    });
    this.worker.on('exit', (code) => {
      if (!this.closed) {
        const cause = new MetricsWorkerError(
          `The computer metrics worker stopped with code ${String(code)}.`,
        );
        deps.log.error('node.metrics_worker_exited', cause);
        this.failAll(cause);
      }
    });
  }

  readonly hello = (now: Date): Promise<NodeHello> =>
    this.ask(this.hellos, (id) => ({ type: 'hello', id, now: now.toISOString() }));

  readonly backfill: NodeMetrics['backfill'] = (query) =>
    this.ask(this.columns, (id) => ({ type: 'backfill', id, query }));

  readonly start = (): void => {
    this.post({ type: 'start' });
  };

  readonly stop = (): void => {
    this.post({ type: 'stop' });
  };

  readonly demand: NodeMetrics['demand'] = (owner, topics) => {
    this.post({ type: 'demand', owner, topics });
  };

  readonly release: NodeMetrics['release'] = (owner) => {
    this.post({ type: 'release', owner });
  };

  readonly poke: NodeMetrics['poke'] = (topic) => {
    this.post({ type: 'poke', topic });
  };

  readonly setPolicy: NodeMetrics['setPolicy'] = (policy) => {
    this.post({ type: 'policy', policy });
  };

  readonly track: NodeMetrics['track'] = (policy) => {
    this.post({ type: 'track', policy });
  };

  readonly watchProcesses: NodeMetrics['watchProcesses'] = (window) => {
    this.post({ type: 'watch', window });
  };

  readonly close = (): void => {
    if (this.closed) return;
    this.post({ type: 'close' });
    this.closed = true;
    this.failAll(new MetricsWorkerError('The computer metrics worker was stopped.'));
  };

  private ask<T>(waiting: Map<number, Waiting<T>>, message: (id: number) => ToMetrics): Promise<T> {
    const id = this.next;
    this.next += 1;
    return new Promise((resolve, reject) => {
      waiting.set(id, { resolve, reject });
      this.post(message(id));
    });
  }

  private post(message: ToMetrics): void {
    if (this.closed) throw new MetricsWorkerError('The computer metrics worker is stopped.');
    this.worker.postMessage(message);
  }

  private fail(id: number, cause: Error): void {
    this.hellos.get(id)?.reject(cause);
    this.hellos.delete(id);
    this.columns.get(id)?.reject(cause);
    this.columns.delete(id);
  }

  private failAll(cause: unknown): void {
    for (const waiting of [...this.hellos.values(), ...this.columns.values()]) {
      waiting.reject(cause);
    }
    this.hellos.clear();
    this.columns.clear();
  }
}

export function workerMetrics(options: WorkerMetricsOptions): MetricsFactory {
  return (deps) => new WorkerMetrics(options, deps);
}
