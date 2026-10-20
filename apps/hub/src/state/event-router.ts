import type { DeviceEvent, EventKind, JsonValue, Provider } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { DeviceRecord, EventInsert, HubDatabase } from '../database/port';
import type { Inventory } from './inventory';
import { RepeatLog } from '../providers/repeat-log';
import { WriteQueue, logQueueNotice } from './write-queue';
import { background } from '@smarteverything/logging';

export interface RecordedEvent {
  readonly id: string;
  readonly deviceId: string | null;
  readonly kind: EventKind;
  readonly occurredAt: string;
  readonly details: Readonly<Record<string, JsonValue>>;
}

export interface EventRouterOptions {
  readonly store: Pick<HubDatabase, 'insertEvents' | 'enrichEvent' | 'recordEventOccurrence'>;
  readonly inventory: Pick<Inventory, 'deviceOf'>;
  readonly log: Logger;
  readonly recorded: (event: RecordedEvent) => void;
  readonly claim?: (device: DeviceRecord, event: DeviceEvent) => boolean;
}

const OPEN_OCCURRENCES_MOST = 512;
const EVENT_APPEND_POLICY = { pendingLimit: 512, batchLimit: 1, attempts: 3, retryMs: 100 };
interface KeyedEvent {
  readonly event: EventInsert;
  readonly key: string;
}

export class EventRouter {
  private closed = false;
  private readonly queue: WriteQueue<EventInsert, string>;
  private readonly committedQueue: WriteQueue<KeyedEvent, string>;
  private readonly occurrences = new Map<string, Promise<string>>();
  private readonly repeat: RepeatLog;
  private received = 0;

  constructor(private readonly options: EventRouterOptions) {
    this.repeat = new RepeatLog(options.log);
    this.queue = new WriteQueue<EventInsert, string>({
      write: (rows): Promise<readonly string[]> => options.store.insertEvents(rows),
      keyOf: (): null => null,
      failed: (rows, cause): void => {
        options.log.error('event.write_failed', cause, { count: rows.length });
      },
    });
    this.committedQueue = new WriteQueue<KeyedEvent, string>({
      write: async (rows): Promise<readonly string[]> => {
        const result: string[] = [];
        for (const row of rows) result.push(await this.commitOccurrence(row.event, row.key));
        return result;
      },
      keyOf: (): null => null,
      append: EVENT_APPEND_POLICY,
      observe: (notice): void => {
        logQueueNotice(options.log, 'event', notice);
      },
      failed: (rows, cause): void => {
        options.log.error('event.commit_failed', cause, { count: rows.length });
      },
    });
  }

  fromProvider(provider: Provider, event: DeviceEvent): void {
    const device = this.options.inventory.deviceOf(provider, event.externalId);
    if (device === undefined) {
      this.repeat.warn('event.device_unknown', `${provider}|${event.externalId}`, {
        provider,
        externalId: event.externalId,
        kind: event.kind,
      });
      return;
    }
    if (this.options.claim?.(device, event) === true) {
      return;
    }
    const insert = {
      deviceId: device.id,
      kind: event.kind,
      occurredAt: event.occurredAt,
      details: event.details,
    };
    this.received += 1;
    this.repeat.debug('event.received_summary', 'received', {
      provider,
      kind: event.kind,
      received: this.received,
      committed: event.occurrence !== undefined,
    });
    if (event.occurrence === undefined) {
      this.record(insert);
      return;
    }
    this.fromProviderCommitted(provider, event).catch((cause: unknown) => {
      this.options.log.error('event.not_committed', cause, {
        provider,
        externalId: event.externalId,
        kind: event.kind,
      });
    });
  }

  fromProviderCommitted(provider: Provider, event: DeviceEvent): Promise<string> {
    if (this.closed) return Promise.reject(new EventRouterClosedError());
    const device = this.options.inventory.deviceOf(provider, event.externalId);
    if (device === undefined)
      return Promise.reject(new EventDeviceUnknownError(provider, event.externalId));
    const insert = {
      deviceId: device.id,
      kind: event.kind,
      occurredAt: event.occurredAt,
      details: event.details,
    };
    if (event.occurrence === undefined) return this.write(insert);
    const key = `${provider}:${event.occurrence}`;
    const existing = this.occurrences.get(key);
    if (existing !== undefined)
      return existing.then(async (id): Promise<string> => {
        await this.options.store.enrichEvent(id, insert.details);
        return id;
      });
    const committed = this.committedQueue.push({ event: insert, key });
    this.remember(key, committed);
    // eslint-disable-next-line local/no-swallowed-errors -- the caller receives the same failure from the commit
    committed.catch(() => {
      if (this.occurrences.get(key) === committed) this.occurrences.delete(key);
    });
    return committed;
  }
  private async commitOccurrence(event: EventInsert, key: string): Promise<string> {
    const result = await this.options.store.recordEventOccurrence(event, key);
    if (result.inserted) this.report({ id: result.id, ...event });
    return result.id;
  }

  record(event: EventInsert): void {
    background(this.write(event), 'event_router.write_failed');
  }

  append(event: EventInsert): Promise<string> {
    return this.write(event);
  }

  private write(event: EventInsert): Promise<string> {
    const written = this.queue.push(event);
    written.then(
      (id) => {
        this.report({ id, ...event });
      },
      (cause: unknown) => {
        this.options.log.debug('event.not_recorded', {
          kind: event.kind,
          reason: cause instanceof Error ? cause.name : 'unknown',
        });
      },
    );
    return written;
  }

  private report(event: RecordedEvent): void {
    if (event.kind !== 'signal') this.options.recorded(event);
  }

  private remember(key: string, written: Promise<string>): void {
    this.occurrences.set(key, written);
    const oldest = this.occurrences.keys().next();
    if (this.occurrences.size > OPEN_OCCURRENCES_MOST && oldest.done !== true) {
      this.occurrences.delete(oldest.value);
    }
  }

  async settled(): Promise<void> {
    await Promise.all([this.queue.settled(), this.committedQueue.settled()]);
    await Promise.all([...this.occurrences.values()]);
  }
  async close(): Promise<void> {
    this.closed = true;
    await Promise.all([this.queue.close(), this.committedQueue.close()]);
  }
}

class EventDeviceUnknownError extends Error {
  override readonly name = 'EventDeviceUnknownError';
  constructor(
    readonly provider: Provider,
    readonly externalId: string,
  ) {
    super('The event target is absent from the committed inventory.');
  }
}

class EventRouterClosedError extends Error {
  override readonly name = 'EventRouterClosedError';
  constructor() {
    super('The event router is closed and cannot accept a committed event.');
  }
}
