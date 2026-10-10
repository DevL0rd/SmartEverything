import { EVENT_ROW, type EventKind, type EventRow, type JsonValue } from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, moment, type StoreContext } from '../context';
import { jsonText } from '../sql';
import { windowFilter, type TimeWindow } from './window';

const STORED_EVENT = storedRow(EVENT_ROW, { json: ['details'] });

const COLUMNS = 'id, device_id, kind, occurred_at, details, acknowledged_at, created_at';

export interface NewEvent {
  readonly deviceId: string | null;
  readonly kind: EventKind;
  readonly occurredAt: string;
  readonly details: Readonly<Record<string, JsonValue>>;
}

export class EventsRepository {
  constructor(private readonly context: StoreContext) {}

  list(window: TimeWindow & { readonly kinds?: readonly EventKind[] | undefined }): EventRow[] {
    const filter = windowFilter('occurred_at', window);
    const kinds = window.kinds ?? [];
    const names = kinds.map((kind, index) => {
      filter.parameters[`kind${String(index)}`] = kind;
      return `$kind${String(index)}`;
    });
    const kindClause = names.length === 0 ? '' : ` and kind in (${names.join(', ')})`;
    return this.context.sql.all(
      STORED_EVENT,
      `select ${COLUMNS} from events where ${filter.text}${kindClause} order by occurred_at desc, rowid desc limit $limit`,
      filter.parameters,
    );
  }

  byId(id: string): EventRow {
    return found(
      this.context.sql.get(STORED_EVENT, `select ${COLUMNS} from events where id = $id`, { id }),
      'event',
      id,
    );
  }

  insert(events: readonly NewEvent[]): EventRow[] {
    return this.context.write(() =>
      events.map((event) => {
        const id = this.context.newId();
        this.context.sql.run(
          'record the event',
          `insert into events (id, device_id, kind, occurred_at, details, created_at)
           values ($id, $deviceId, $kind, $occurredAt, $details, $now)`,
          {
            id,
            deviceId: event.deviceId,
            kind: event.kind,
            occurredAt: moment(event.occurredAt),
            details: jsonText(event.details),
            now: this.context.now(),
          },
        );
        const row = this.byId(id);
        this.context.changed('events', 'INSERT', row, null);
        return row;
      }),
    );
  }

  enrich(id: string, details: Readonly<Record<string, JsonValue>>): EventRow {
    return this.context.write(() => {
      const before = this.byId(id);
      if (Object.keys(details).every((key) => Object.hasOwn(before.details, key))) {
        return before;
      }
      this.context.sql.run(
        'enrich the event',
        'update events set details = $details where id = $id',
        { id, details: jsonText({ ...details, ...before.details }) },
      );
      const after = this.byId(id);
      this.context.changed('events', 'UPDATE', after, before);
      return after;
    });
  }

  acknowledge(id: string): EventRow {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run(
        'acknowledge the event',
        'update events set acknowledged_at = coalesce(acknowledged_at, $now) where id = $id',
        { id, now: this.context.now() },
      );
      const after = this.byId(id);
      this.context.changed('events', 'UPDATE', after, before);
      return after;
    });
  }

  remove(id: string): EventRow {
    return this.context.write(() => {
      const before = this.byId(id);
      this.context.sql.run('remove the event', 'delete from events where id = $id', { id });
      this.context.changed('events', 'DELETE', null, before);
      return before;
    });
  }
}
