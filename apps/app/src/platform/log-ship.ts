import {
  API_ENDPOINTS as E,
  LOG_RECORD,
  type RuntimeLogAck,
  type RuntimeLogRecord,
} from '@smarteverything/domain';
import type { z } from 'zod';
import {
  Logger,
  background,
  clip,
  shippedRecord,
  type LogPayload,
  type LogRecord,
} from '@smarteverything/logging';
import { readDeveloperFlags, watchDeveloperFlags } from '../developer/flags';
import {
  BATCH_BYTES,
  OFFLINE_BUFFER_BYTES,
  batchFrom,
  queued,
  sizeOf,
  withinBuffer,
  type QueuedRecord,
} from './log-batch';
import { combineGaps, readLogOutbox, writeLogOutbox, type LogGap } from './log-offload';
import { shipLevelOf, wantsShipped, type ShipLevel } from './ship-level';
import { bindStartupLogs, keepStartupLog } from './startup-logs';

const SHIP_SCOPE = 'app.log-ship';
const log = new Logger(SHIP_SCOPE);
const DRAIN_AFTER_MS = 30_000;
const RECENT_EVENTS = 40;
const RECENT_DETAIL = 400;
const UPLOAD_ROUTE = `${E.ingestRuntimeLogs.method} ${E.ingestRuntimeLogs.path}`;
let screen = 'start';

export function setLogScreen(value: string): void {
  screen = value === '' ? 'start' : value;
}

function feedbackOfShipment(record: LogRecord): boolean {
  return (
    record.scope === SHIP_SCOPE ||
    (record.scope === 'app.api' && record.payload['route'] === UPLOAD_ROUTE) ||
    (record.scope === 'app.native' &&
      record.payload['nativeScope'] === 'hub-client' &&
      record.payload['method'] === E.ingestRuntimeLogs.method &&
      record.payload['route'] === E.ingestRuntimeLogs.path)
  );
}

class UnacknowledgedLogsError extends Error {
  override readonly name = 'UnacknowledgedLogsError';

  constructor(acknowledged: number, attempted: number) {
    super(`The hub acknowledged ${String(acknowledged)} of ${String(attempted)} runtime logs.`);
  }
}

export interface LogIdentity {
  readonly hub: string;
  readonly clientId: string;
  readonly profileId: string;
}

export function logScopeOf(identity: LogIdentity): string {
  return JSON.stringify([identity.hub, identity.clientId, identity.profileId]);
}

export type SendLogBatch = (
  body: z.input<typeof E.ingestRuntimeLogs.body>,
) => Promise<RuntimeLogAck>;

interface RecentEvent {
  readonly at: string;
  readonly scope: string;
  readonly event: string;
  readonly screen: string;
  readonly level: string;
  readonly detail?: string;
}

function detailOf(payload: LogPayload): string | undefined {
  const text = JSON.stringify(payload);
  if (text === undefined || text === '{}') return undefined;
  return clip(text, RECENT_DETAIL);
}

export class LogShip {
  private recent: RecentEvent[] = [];
  private queue: QueuedRecord[] = [];
  private queueBytes = 0;
  private inFlight: readonly QueuedRecord[] = [];
  private gap: LogGap | null = null;
  private sendingGap: LogGap | null = null;
  private loaded: Promise<void> | null = null;
  private saving: Promise<void> = Promise.resolve();
  private saveQueued = false;
  private pendingSave: Promise<void> = Promise.resolve();
  private sent: Promise<void> = Promise.resolve();
  private level: ShipLevel = 'warn';
  private drain: ReturnType<typeof setTimeout> | null = null;
  private unwatch: (() => void) | null = null;
  private send: SendLogBatch | null = null;
  private readonly scope: string;

  constructor(private readonly identity: LogIdentity) {
    this.scope = logScopeOf(identity);
  }

  get pending(): number {
    return this.queue.length;
  }

  get buffered(): number {
    return this.queueBytes;
  }

  start(): void {
    this.boot();
    this.unwatch ??= watchDeveloperFlags(() => {
      this.boot();
    });
  }

  private boot(): void {
    this.level = shipLevelOf(readDeveloperFlags());
  }

  stop(): void {
    this.unwatch?.();
    this.unwatch = null;
    this.pause();
  }

  record(logged: LogRecord): void {
    if (feedbackOfShipment(logged)) return;
    if (wantsShipped(logged.level, this.level)) this.ship(logged);
    this.remember(logged);
  }

  private ship(logged: LogRecord): void {
    try {
      const payload = wantsShipped(logged.level, 'warn')
        ? { ...logged.payload, screen, recent: this.recent }
        : logged.payload;
      this.enqueue(LOG_RECORD.parse(shippedRecord({ ...logged, payload })));
    } catch (cause) {
      log.warn('logs.not_queued', { reason: String(cause) });
      return;
    }
    this.save();
    this.arm(DRAIN_AFTER_MS);
  }

  private remember(record: LogRecord): void {
    const { timestamp: at, scope, event, level } = record;
    const detail = detailOf(record.payload);
    this.recent.push({
      at,
      scope,
      event,
      screen,
      level,
      ...(detail === undefined ? {} : { detail }),
    });
    if (this.recent.length > RECENT_EVENTS) this.recent.shift();
  }

  private enqueue(item: RuntimeLogRecord): void {
    const record = queued(item);
    if (record.bytes > BATCH_BYTES) {
      this.lost([record]);
      return;
    }
    this.queue.push(record);
    this.queueBytes += record.bytes;
    this.boundQueue();
  }

  async retainStartup(records: readonly RuntimeLogRecord[]): Promise<void> {
    for (const record of records) {
      if (wantsShipped(record.level, this.level)) this.enqueue(record);
    }
    if (this.queue.length === 0) return;
    this.save();
    await this.pendingSave;
    this.arm(0);
  }

  resume(send: SendLogBatch): void {
    this.send = send;
    this.arm(0);
  }

  pause(): void {
    this.send = null;
    if (this.drain === null) return;
    clearTimeout(this.drain);
    this.drain = null;
  }

  flush(): Promise<void> {
    this.sent = this.sent
      .then(() => this.drainQueued())
      .catch((cause: unknown) => {
        log.warn('logs.not_sent', { reason: String(cause) });
      });
    return this.sent;
  }

  async settled(): Promise<void> {
    await this.sent;
    await this.saving;
  }

  private lost(records: readonly QueuedRecord[]): void {
    const first = records[0];
    if (first === undefined) return;
    this.gap = combineGaps(this.gap, { count: records.length, from: first.record.timestamp });
  }

  private boundQueue(): void {
    if (this.queueBytes <= OFFLINE_BUFFER_BYTES) return;
    const waiting = this.queue.slice(this.inFlight.length);
    const kept = withinBuffer(waiting, OFFLINE_BUFFER_BYTES - sizeOf(this.inFlight));
    const lost = waiting.slice(0, waiting.length - kept.length);
    this.lost(lost);
    this.queueBytes -= sizeOf(lost);
    this.queue = [...this.inFlight, ...kept];
  }

  private restore(): Promise<void> {
    this.loaded ??= readLogOutbox(this.scope)
      .then(({ records, gap }) => {
        this.gap = combineGaps(this.gap, gap);
        const recovered = records.map(queued);
        this.queue = [...recovered, ...this.queue];
        this.queueBytes += sizeOf(recovered);
        this.boundQueue();
      })
      .catch((cause: unknown) => {
        this.loaded = null;
        throw cause;
      });
    return this.loaded;
  }

  private save(): void {
    if (this.saveQueued) return;
    this.saveQueued = true;
    const saving = this.saving.then(async () => {
      await this.restore().finally(() => {
        this.saveQueued = false;
      });
      await writeLogOutbox(this.scope, {
        records: this.queue.map((item) => item.record),
        gap: combineGaps(this.gap, this.sendingGap),
      });
    });
    this.pendingSave = saving;
    this.saving = saving.catch((cause: unknown) => {
      log.warn('logs.not_kept', { reason: String(cause) });
    });
  }

  private arm(delayMs: number): void {
    if (this.send === null || this.drain !== null) return;
    this.drain = setTimeout(() => {
      this.drain = null;
      background(this.flush(), 'logs.drain_failed');
    }, delayMs);
  }

  private async drainQueued(): Promise<void> {
    await this.restore();
    const last = this.queue.at(-1);
    if (last === undefined) return;
    const sender = this.send;
    while (sender !== null && sender === this.send) {
      const batch = batchFrom(this.queue.slice(0, this.queue.indexOf(last) + 1));
      if (batch.length === 0) return;
      await this.sendBatch(batch, sender);
    }
  }

  private async sendBatch(batch: readonly QueuedRecord[], sender: SendLogBatch): Promise<void> {
    this.inFlight = batch;
    this.sendingGap = this.gap;
    this.gap = null;
    try {
      this.save();
      await this.pendingSave;
      if (sender !== this.send) {
        this.gap = combineGaps(this.gap, this.sendingGap);
        return;
      }
      const ack = await sender({
        clientId: this.identity.clientId,
        profileId: this.identity.profileId,
        dropped: this.sendingGap?.count ?? 0,
        records: batch.map((item) => item.record),
        ...(this.sendingGap === null ? {} : { oldestSentAt: this.sendingGap.from }),
      });
      const acknowledged = ack.accepted + ack.alreadyStored;
      if (acknowledged !== batch.length)
        throw new UnacknowledgedLogsError(acknowledged, batch.length);
      this.queue = this.queue.slice(batch.length);
      this.queueBytes -= sizeOf(batch);
    } catch (cause) {
      this.gap = combineGaps(this.gap, this.sendingGap);
      throw cause;
    } finally {
      this.inFlight = [];
      this.sendingGap = null;
    }
    this.save();
    await this.pendingSave;
  }
}

interface LogBinding {
  readonly ship: LogShip;
  readonly current: () => boolean;
}

const resident = new Map<string, LogShip>();
let active: LogBinding | null = null;

export function shipLog(record: LogRecord): void {
  if (active?.current() === true) {
    active.ship.record(record);
  } else if (!feedbackOfShipment(record)) {
    keepStartupLog(record);
  }
}

export function bindLogShipping(
  identity: LogIdentity,
  current: () => boolean,
  send: SendLogBatch | null,
): () => void {
  const scope = logScopeOf(identity);
  const ship = resident.get(scope) ?? new LogShip(identity);
  resident.set(scope, ship);
  const binding = { ship, current };
  active = binding;
  ship.start();
  if (send !== null) ship.resume(send);
  background(
    bindStartupLogs(
      scope,
      () => active?.ship === ship && active.current(),
      (records) => ship.retainStartup(records),
    ),
    'startup_logs.binding_failed',
  );
  return (): void => {
    if (active !== binding) return;
    active = null;
    ship.stop();
    background(
      ship.settled().then(() => {
        if (active?.ship !== ship) resident.delete(scope);
      }),
      'logs.unbind_failed',
    );
  };
}
