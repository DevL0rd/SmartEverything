import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { RuntimeLogAck } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import { readFilter, type RuntimeLogReads } from '../store/repositories/runtime-log-reads';
import type {
  LogAccess,
  LogAround,
  LogSearch,
  LogSourceInfo,
  StoredLogRecord,
} from '../store/repositories/runtime-log-types';
import { LOG_REPLY, type LogRead, type LogReply, type LogRequestInput } from './messages';
import { checkIngestAccess, HUB_CLIENT, type IngestRequest, type RepairEvidence } from './writes';

export const BUNDLED_LOG_WORKER = fileURLToPath(new URL('./log-worker.mjs', import.meta.url));

export interface RepairGroups {
  readonly observe: (evidence: RepairEvidence) => Promise<void>;
  readonly mayAutoAdmit: (fingerprint: string) => Promise<boolean>;
}

export interface LogStoreOptions {
  readonly path: string;
  readonly workerScript: string;
  readonly repairs: RepairGroups;
  readonly now: () => Date;
  readonly log: Logger;
  readonly fatal: (cause: Error) => void;
}

type Written = Extract<LogReply, { readonly kept: number }>;
type Changed = Extract<LogReply, { readonly changed: number }>;
type Read = Extract<LogReply, { readonly value: unknown }>;
type Answer = Written | Changed | Read;

type ReadResult<M extends keyof RuntimeLogReads> = ReturnType<RuntimeLogReads[M]>;

interface Pending {
  readonly resolve: (answer: Answer) => void;
  readonly reject: (cause: Error) => void;
}

type RepairListener = (record: StoredLogRecord, fingerprint: string) => void;

const SLOW_SWEEP_MS = 1000;

class LogWriterStoppedError extends Error {
  override readonly name = 'LogWriterStoppedError';
}

export class LogStore {
  private worker: Worker | null = null;
  private reader: Worker | null = null;
  private ready: (() => void) | null = null;
  private failedStart: ((cause: Error) => void) | null = null;
  private readonly pending = new Map<number, Pending>();
  private next = 0;
  private stopped: Error | null = null;
  private listener: RepairListener | null = null;
  private closing = false;
  private readonly inflight = new Set<Promise<unknown>>();

  static async open(options: LogStoreOptions): Promise<LogStore> {
    const store = new LogStore(options);
    await store.start();
    return store;
  }

  private constructor(private readonly options: LogStoreOptions) {}

  private async start(): Promise<void> {
    const migrated = new Promise<void>((resolve) => {
      this.ready = resolve;
    });
    const failed = new Promise<never>((_resolve, reject) => {
      this.failedStart = reject;
    });
    const writer = this.started('write', 'writer');
    this.worker = writer;
    try {
      await Promise.race([migrated, failed]);
    } catch (cause) {
      await writer.terminate();
      throw cause;
    } finally {
      this.failedStart = null;
    }
    this.reader = this.started('read', 'reader');
  }

  search(access: LogAccess, search: LogSearch): Promise<ReadResult<'search'>> {
    return this.read({ method: 'search', access, search });
  }

  around(access: LogAccess, around: LogAround): Promise<ReadResult<'around'>> {
    return this.read({ method: 'around', access, around });
  }

  sources(access: LogAccess): Promise<ReadResult<'sources'>> {
    return this.read({ method: 'sources', access });
  }

  components(
    access: LogAccess,
    since: string,
    levels: readonly string[],
  ): Promise<ReadResult<'components'>> {
    return this.read({ method: 'components', access, since, levels });
  }

  signatures(
    access: LogAccess,
    since: string,
    component: string | undefined,
  ): Promise<ReadResult<'signatures'>> {
    return this.read({ method: 'signatures', access, since, component });
  }

  platforms(access: LogAccess): Promise<ReadResult<'platforms'>> {
    return this.read({ method: 'platforms', access });
  }

  gaps(access: LogAccess): Promise<ReadResult<'gaps'>> {
    return this.read({ method: 'gaps', access });
  }

  clientOf(logId: number): Promise<ReadResult<'clientOf'>> {
    return this.read({ method: 'clientOf', logId });
  }

  onRepairEvidence(listener: RepairListener): () => void {
    this.listener = listener;
    return (): void => {
      if (this.listener === listener) this.listener = null;
    };
  }

  async append(
    records: readonly StoredLogRecord[],
    source: LogSourceInfo,
    at: string,
  ): Promise<number> {
    const clientId = source.clientId ?? HUB_CLIENT;
    const written = await this.written({
      op: 'append',
      records: [...records],
      clientId,
      observe: clientId === HUB_CLIENT,
      source,
      at,
    });
    return written.kept;
  }

  ingest(request: IngestRequest): Promise<RuntimeLogAck> {
    checkIngestAccess(request);
    const { batch } = request;
    const sent = {
      op: 'ingest',
      ...request,
      batch: {
        records: batch.records,
        ...(batch.dropped === undefined ? {} : { dropped: batch.dropped }),
        ...(batch.oldestSentAt === undefined ? {} : { oldestSentAt: batch.oldestSentAt }),
      },
    } as const;
    return this.written(sent).then((written) => {
      if (written.ack === null) throw new Error('The runtime log writer returned no receipt.');
      return written.ack;
    });
  }

  async recordGap(source: LogSourceInfo, firstSentAt: string, lastSentAt: string): Promise<number> {
    return (await this.changed({ op: 'gap', source, firstSentAt, lastSentAt })).changed;
  }

  drop(access: LogAccess, before: string | undefined): Promise<number> {
    readFilter(access);
    return this.changed({ op: 'drop', access, before: before ?? null }).then(
      (answer) => answer.changed,
    );
  }

  async settled(): Promise<void> {
    await Promise.allSettled([...this.inflight]);
  }

  async close(): Promise<void> {
    this.closing = true;
    await this.settled();
    this.halt(new LogWriterStoppedError('The runtime log writer was closed.'));
    await Promise.all(
      [this.worker, this.reader].flatMap((worker) => (worker === null ? [] : [worker.terminate()])),
    );
  }

  private started(mode: 'write' | 'read', role: string): Worker {
    const worker = new Worker(this.options.workerScript, {
      workerData: { path: this.options.path, mode },
    });
    worker.unref();
    worker.on('message', (raw: unknown) => {
      this.answered(LOG_REPLY.parse(raw));
    });
    worker.on('error', (cause) => {
      this.halt(
        new LogWriterStoppedError(`The runtime log ${role} failed: ${messageOf(cause)}`, {
          cause,
        }),
      );
    });
    worker.on('exit', (code) => {
      this.halt(
        new LogWriterStoppedError(`The runtime log ${role} stopped with code ${String(code)}.`),
      );
    });
    return worker;
  }

  private read<M extends LogRead['method']>(
    read: Extract<LogRead, { readonly method: M }>,
  ): Promise<ReadResult<M>>;
  private async read(read: LogRead): Promise<unknown> {
    if (read.method !== 'clientOf') readFilter(read.access);
    const reader = this.reader;
    if (reader === null) throw new LogWriterStoppedError('The runtime log reader has not started.');
    const answer = await this.posted((id) => {
      reader.postMessage({ id, read });
    });
    if (!('value' in answer)) throw new Error('The runtime log reader answered a read as a write.');
    return answer.value;
  }

  private tracked<T>(work: Promise<T>): Promise<T> {
    this.inflight.add(work);
    const forget = (): void => {
      this.inflight.delete(work);
    };
    work.then(forget, forget);
    return work;
  }

  private written(request: Unsent): Promise<Written> {
    return this.tracked(this.writtenNow(request));
  }

  private async writtenNow(request: Unsent): Promise<Written> {
    const answer = await this.request(request);
    if (!('kept' in answer))
      throw new Error('The runtime log writer answered a write as a change.');
    for (const evidence of answer.evidence) await this.observed(evidence);
    return answer;
  }

  private changed(request: Unsent): Promise<Changed> {
    return this.tracked(this.changedNow(request));
  }

  private async changedNow(request: Unsent): Promise<Changed> {
    const answer = await this.request(request);
    if (!('changed' in answer))
      throw new Error('The runtime log writer answered a change as a write.');
    return answer;
  }

  private request(request: Unsent): Promise<Answer> {
    const writer = this.worker;
    if (writer === null)
      return Promise.reject(new LogWriterStoppedError('The runtime log writer has not started.'));
    return this.posted((id) => {
      writer.postMessage({ ...request, id, clock: this.options.now().toISOString() });
    });
  }

  private posted(send: (id: number) => void): Promise<Answer> {
    if (this.stopped !== null) return Promise.reject(this.stopped);
    this.next += 1;
    const id = this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      send(id);
    });
  }

  private async observed(evidence: RepairEvidence): Promise<void> {
    const { repairs } = this.options;
    await repairs.observe(evidence);
    const listener = this.listener;
    if (listener !== null && (await repairs.mayAutoAdmit(evidence.fingerprint)))
      listener(evidence.record, evidence.fingerprint);
  }

  private answered(reply: LogReply): void {
    if ('ready' in reply) {
      this.ready?.();
      this.ready = null;
      return;
    }
    if ('swept' in reply) {
      const level = reply.durationMs >= SLOW_SWEEP_MS ? 'info' : 'debug';
      this.options.log[level]('logs.retention_swept', {
        ...reply.swept,
        durationMs: Math.round(reply.durationMs),
      });
      return;
    }
    if ('sweepFailure' in reply) {
      this.options.log.warn('logs.retention_failed', { reason: reply.sweepFailure });
      return;
    }
    const pending = this.pending.get(reply.id);
    if (pending === undefined)
      throw new Error(`The runtime log worker answered unknown request ${String(reply.id)}.`);
    this.pending.delete(reply.id);
    if ('failure' in reply) pending.reject(new Error(reply.failure));
    else pending.resolve(reply);
  }

  private halt(cause: Error): void {
    if (this.stopped !== null) return;
    this.stopped = cause;
    for (const pending of this.pending.values()) pending.reject(cause);
    this.pending.clear();
    const starting = this.failedStart;
    if (starting !== null) {
      starting(cause);
      return;
    }
    if (!this.closing) this.options.fatal(cause);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type Unsent = DistributiveOmit<LogRequestInput, 'id' | 'clock'>;
