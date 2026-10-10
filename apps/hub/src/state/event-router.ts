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
  readonly store: Pick<HubDatabase, 'insertEvents'>;
  readonly inventory: Pick<Inventory, 'deviceOf'>;
  readonly log: Logger;
  readonly recorded: (event: RecordedEvent) => void;
}

export class EventRouter {
  private readonly queue: WriteQueue<EventInsert, string>;

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
    this.record({
      deviceId: device.id,
      kind: event.kind,
      occurredAt: event.occurredAt,
      details: event.details,
    });
  }

  record(event: EventInsert): void {
    this.queue.push(event).then(
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
  }

  settled(): Promise<void> {
    return this.queue.settled();
  }
}
