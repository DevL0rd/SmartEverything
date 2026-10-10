import type { DeviceEvent, EventKind, JsonValue, Provider } from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { EventInsert, HubDatabase } from '../database/port';
import type { Inventory } from './inventory';
import { WriteQueue } from './write-queue';

export interface RecordedEvent {
  readonly id: string;
  readonly deviceId: string | null;
  readonly kind: EventKind;
  readonly occurredAt: string;
  readonly details: Readonly<Record<string, JsonValue>>;
}

export interface EventRouterOptions {
  readonly store: Pick<HubDatabase, 'insertEvents' | 'enrichEvent'>;
  readonly inventory: Pick<Inventory, 'deviceOf'>;
  readonly log: Logger;
  readonly recorded: (event: RecordedEvent) => void;
}

const OPEN_OCCURRENCES_MOST = 512;

export class EventRouter {
  private readonly queue: WriteQueue<EventInsert, string>;
  private readonly occurrences = new Map<string, Promise<string>>();

  constructor(private readonly options: EventRouterOptions) {
    this.queue = new WriteQueue<EventInsert, string>({
      write: (rows): Promise<readonly string[]> => options.store.insertEvents(rows),
      keyOf: (): null => null,
      failed: (rows, cause): void => {
        options.log.error('event.write_failed', cause, { count: rows.length });
      },
    });
  }

  fromProvider(provider: Provider, event: DeviceEvent): void {
    const device = this.options.inventory.deviceOf(provider, event.externalId);
    if (device === undefined) {
      this.options.log.warn('event.device_unknown', { provider, externalId: event.externalId });
      return;
    }
    const insert = {
      deviceId: device.id,
      kind: event.kind,
      occurredAt: event.occurredAt,
      details: event.details,
    };
    if (event.occurrence === undefined) {
      this.record(insert);
      return;
    }
    const key = `${provider}:${event.occurrence}`;
    const recorded = this.occurrences.get(key);
    if (recorded === undefined) {
      this.remember(key, this.write(insert));
      return;
    }
    this.enrich(recorded, insert);
  }

  record(event: EventInsert): void {
    void this.write(event);
  }

  private write(event: EventInsert): Promise<string> {
    const written = this.queue.push(event);
    written.then(
      (id) => {
        this.options.recorded({ id, ...event });
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

  private remember(key: string, written: Promise<string>): void {
    this.occurrences.set(key, written);
    const oldest = this.occurrences.keys().next();
    if (this.occurrences.size > OPEN_OCCURRENCES_MOST && oldest.done !== true) {
      this.occurrences.delete(oldest.value);
    }
  }

  private enrich(recorded: Promise<string>, event: EventInsert): void {
    recorded
      .then((id) => this.options.store.enrichEvent(id, event.details))
      .catch((cause: unknown) => {
        this.options.log.error('event.enrich_failed', cause, { kind: event.kind });
      });
  }

  settled(): Promise<void> {
    return this.queue.settled();
  }
}
