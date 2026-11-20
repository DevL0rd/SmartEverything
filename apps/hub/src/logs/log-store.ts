import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import type { RuntimeLogAck } from '@smarteverything/domain';
import { messageOf, type Logger } from '@smarteverything/logging';
import { Sql } from '../store/sql';
import { readFilter, RuntimeLogReads } from '../store/repositories/runtime-log-reads';
import type {
  LogAccess,
  LogSourceInfo,
  StoredLogRecord,
} from '../store/repositories/runtime-log-types';
import { LOG_REPLY, type LogReply, type LogRequestInput } from './messages';
import { openLogReader, openLogWriter } from './schema';
import { checkIngestAccess, HUB_CLIENT, type IngestRequest, type RepairEvidence } from './writes';

export const BUNDLED_LOG_WORKER = fileURLToPath(new URL('./log-worker.mjs', import.meta.url));

export interface RepairGroups {
  readonly observe: (evidence: RepairEvidence) => void;
  readonly mayAutoAdmit: (fingerprint: string) => boolean;
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
type Answer = Written | Changed;

interface Pending {
  readonly resolve: (answer: Answer) => void;
  readonly reject: (cause: Error) => void;
}

type RepairListener = (record: StoredLogRecord, fingerprint: string) => void;

const SLOW_SWEEP_MS = 1000;

class LogWriterStoppedError extends Error {
  override readonly name = 'LogWriterStoppedError';
}

export class LogStore extends RuntimeLogReads {
  private readonly worker: Worker;
  private readonly reader: Sql;
  private readonly pending = new Map<number, Pending>();
  private next = 0;
  private stopped: Error | null = null;
  private listener: RepairListener | null = null;
  private closing = false;
  private readonly inflight = new Set<Promise<unknown>>();

  static open(options: LogStoreOptions): LogStore {
    openLogWriter(options.path).close();
    return new LogStore(options, new Sql(openLogReader(options.path)));
  }

  private constructor(
    private readonly options: LogStoreOptions,
    reader: Sql,
  ) {
    super(reader);
    this.reader = reader;
    this.worker = new Worker(options.workerScript, { workerData: { path: options.path } });
    this.worker.unref();
    this.worker.on('message', (raw: unknown) => {
      this.answered(LOG_REPLY.parse(raw));
    });
    this.worker.on('error', (cause) => {
      this.halt(
        new LogWriterStoppedError(`The runtime log writer failed: ${messageOf(cause)}`, { cause }),
      );
    });
    this.worker.on('exit', (code) => {
      this.halt(
        new LogWriterStoppedError(`The runtime log writer stopped with code ${String(code)}.`),
      );
    });
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
    await this.worker.terminate();
    this.reader.database.close();
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
    for (const evidence of answer.evidence) this.observed(evidence);
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
    if (this.stopped !== null) return Promise.reject(this.stopped);
    this.next += 1;
    const id = this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.worker.postMessage({ ...request, id, clock: this.options.now().toISOString() });
    });
  }

  private observed(evidence: RepairEvidence): void {
    const { repairs } = this.options;
    repairs.observe(evidence);
    const listener = this.listener;
    if (listener !== null && repairs.mayAutoAdmit(evidence.fingerprint))
      listener(evidence.record, evidence.fingerprint);
  }

  private answered(reply: LogReply): void {
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
      throw new Error(`The runtime log writer answered unknown request ${String(reply.id)}.`);
    this.pending.delete(reply.id);
    if ('failure' in reply) pending.reject(new Error(reply.failure));
    else pending.resolve(reply);
  }

  private halt(cause: Error): void {
    if (this.stopped !== null) return;
    this.stopped = cause;
    for (const pending of this.pending.values()) pending.reject(cause);
    this.pending.clear();
    if (!this.closing) this.options.fatal(cause);
  }
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;

type Unsent = DistributiveOmit<LogRequestInput, 'id' | 'clock'>;
