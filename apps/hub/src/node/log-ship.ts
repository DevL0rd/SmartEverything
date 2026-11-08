import { randomUUID } from 'node:crypto';
import {
  LOG_RECORD,
  NODE_LOG_BATCH_BYTES,
  RUNTIME_LOG_BATCH_MAX,
  type HubLogReceipt,
  type NodeLogsFrame,
} from '@smarteverything/domain';
import {
  Logger,
  background,
  shippedRecord,
  type LogRecord,
  type LogSink,
} from '@smarteverything/logging';

const OFFLINE_BYTES = 4 * NODE_LOG_BATCH_BYTES;
const ARRAY_BRACKETS = 2;
const SCOPE = 'hub.node-log-ship';

interface QueuedLog {
  readonly record: NodeLogsFrame['batch']['records'][number];
  readonly bytes: number;
}

export class NodeLogShip {
  private pending: QueuedLog[] = [];
  private pendingBytes = 0;
  private dropped = 0;
  private lostAt: string | undefined;
  private batch: NodeLogsFrame | null = null;
  private replay: { readonly frame: NodeLogsFrame; readonly confirm: () => Promise<void> } | null =
    null;
  private awaiting = false;
  private scheduled: NodeJS.Immediate | null = null;
  private sender: ((frame: NodeLogsFrame) => void) | null = null;
  private readonly log = new Logger(SCOPE);

  record(record: LogRecord): void {
    if (record.scope === SCOPE || record.level === 'none') return;
    try {
      const safe = LOG_RECORD.parse(shippedRecord(record, 'server'));
      const bytes = Buffer.byteLength(JSON.stringify(safe)) + 1;
      if (bytes + ARRAY_BRACKETS > NODE_LOG_BATCH_BYTES) {
        this.drop(safe.timestamp);
        return;
      }
      this.pending.push({ record: safe, bytes });
      this.pendingBytes += bytes;
      this.trim();
      this.schedule();
    } catch (cause) {
      this.log.warn('logs.not_queued', { reason: cause instanceof Error ? cause.name : 'unknown' });
    }
  }

  connected(send: (frame: NodeLogsFrame) => void): void {
    this.sender = send;
    this.schedule();
  }

  replayStartup(records: readonly LogRecord[], confirm: () => Promise<void>): void {
    const safe = records.map((record) => LOG_RECORD.parse(shippedRecord(record, 'server')));
    this.replay = {
      frame: { type: 'logs', id: randomUUID(), batch: { records: safe, dropped: 0 } },
      confirm,
    };
    this.schedule();
  }

  disconnected(): void {
    this.sender = null;
    this.awaiting = false;
    if (this.scheduled !== null) clearImmediate(this.scheduled);
    this.scheduled = null;
  }

  receive(receipt: HubLogReceipt): void {
    if (!this.awaiting || this.batch?.id !== receipt.id) return;
    this.awaiting = false;
    if (!receipt.stored) {
      this.disconnected();
      this.log.warn('logs.not_stored', { reason: 'hub_refused_batch' });
      return;
    }
    if (this.replay?.frame.id === receipt.id) {
      const { confirm } = this.replay;
      this.replay = null;
      background(confirm(), 'journal.cursor_not_saved');
    }
    this.batch = null;
    this.schedule();
  }

  private drop(at: string): void {
    this.dropped += 1;
    if (this.lostAt === undefined || at < this.lostAt) this.lostAt = at;
  }

  private trim(): void {
    let count = 0;
    for (const item of this.pending) {
      if (this.pendingBytes <= OFFLINE_BYTES) break;
      this.pendingBytes -= item.bytes;
      this.drop(item.record.timestamp);
      count += 1;
    }
    if (count > 0) this.pending.splice(0, count);
  }

  private schedule(): void {
    if (this.sender === null || this.scheduled !== null || this.awaiting) return;
    if (this.batch === null && this.replay === null && this.pending.length === 0) return;
    this.scheduled = setImmediate(() => {
      this.scheduled = null;
      this.send();
    });
  }

  private send(): void {
    if (this.sender === null || this.awaiting) return;
    this.batch ??= this.replay?.frame ?? this.takeBatch();
    if (this.batch === null) return;
    this.awaiting = true;
    try {
      this.sender(this.batch);
    } catch (cause) {
      this.disconnected();
      this.log.warn('logs.not_sent', { reason: cause instanceof Error ? cause.name : 'unknown' });
    }
  }

  private takeBatch(): NodeLogsFrame | null {
    const records: NodeLogsFrame['batch']['records'] = [];
    let bytes = ARRAY_BRACKETS;
    for (const item of this.pending) {
      if (records.length === RUNTIME_LOG_BATCH_MAX || bytes + item.bytes > NODE_LOG_BATCH_BYTES)
        break;
      records.push(item.record);
      bytes += item.bytes;
      this.pendingBytes -= item.bytes;
    }
    if (records.length === 0) return null;
    this.pending.splice(0, records.length);
    const batch: NodeLogsFrame['batch'] = {
      records,
      dropped: this.dropped,
      ...(this.lostAt === undefined ? {} : { oldestSentAt: this.lostAt }),
    };
    this.dropped = 0;
    this.lostAt = undefined;
    return { type: 'logs', id: randomUUID(), batch };
  }
}

export function shipNodeLogs(ship: NodeLogShip): () => void {
  const previous = Logger.sink;
  const sink: LogSink = (record): void => {
    try {
      if (previous === null) Logger.write(record);
      else previous(record);
    } finally {
      ship.record(record);
    }
  };
  Logger.configure({ sink });
  return (): void => {
    if (Logger.sink === sink) Logger.configure({ sink: previous });
    ship.disconnected();
  };
}
