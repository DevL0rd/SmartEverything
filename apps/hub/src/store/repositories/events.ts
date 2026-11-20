import type { EventAcknowledgment } from '../../database/port';
import { EVENT_ROW, type EventKind, type EventRow, type JsonValue } from '@smarteverything/domain';
import { storedRow } from '../codec';
import { found, moment, type StoreContext } from '../context';
import { allOf, jsonText, type SqlFilter } from '../sql';
import { windowFilter, type TimeWindow } from './window';

const STORED_EVENT = storedRow(EVENT_ROW, { json: ['details'] });

const COLUMNS = 'id, device_id, kind, occurred_at, details, acknowledged_at, created_at';

export interface NewEvent {
  readonly deviceId: string | null;
  readonly kind: EventKind;
  readonly occurredAt: string;
  readonly details: Readonly<Record<string, JsonValue>>;
}

interface SignalRowFilter {
  readonly source?: string | undefined;
  readonly kind?: string | undefined;
}

export interface EventListWindow extends TimeWindow {
  readonly kinds?: readonly EventKind[] | undefined;
  readonly exceptKinds?: readonly EventKind[] | undefined;
  readonly signal?: SignalRowFilter | undefined;
}

function kindsClause(
  prefix: string,
  operator: 'in' | 'not in',
  kinds: readonly EventKind[],
): SqlFilter {
  const named = kinds.map((kind, index) => [`${prefix}${String(index)}`, kind] as const);
  const names = named.map(([name]) => `$${name}`);
  return {
    text: names.length === 0 ? '' : ` and kind ${operator} (${names.join(', ')})`,
    parameters: Object.fromEntries(named),
  };
}

function signalFilterOf(signal: SignalRowFilter | undefined): SqlFilter | undefined {
  const parts: SqlFilter[] = [
    ...(signal?.source === undefined
      ? []
      : [
          {
            text: "json_extract(details, '$.source') = $signalSource",
            parameters: { signalSource: signal.source },
          },
        ]),
    ...(signal?.kind === undefined
      ? []
      : [
          {
            text: "json_extract(details, '$.kind') = $signalKind",
            parameters: { signalKind: signal.kind },
          },
        ]),
  ];
  return parts.length === 0
    ? undefined
    : allOf([{ text: "kind = 'signal'", parameters: {} }, ...parts]);
}

export class EventsRepository {
  constructor(private readonly context: StoreContext) {}

  list(window: EventListWindow): EventRow[] {
    const filter = windowFilter('occurred_at', window);
    const included = kindsClause('kind', 'in', window.kinds ?? []);
    const excluded = kindsClause('except', 'not in', window.exceptKinds ?? []);
    const kindClause = included.text + excluded.text;
    Object.assign(filter.parameters, included.parameters, excluded.parameters);
    const signal = signalFilterOf(window.signal);
    const signalClause = signal === undefined ? '' : ` and ${signal.text}`;
    Object.assign(filter.parameters, signal?.parameters);
    return this.context.sql.all(
      STORED_EVENT,
      `select ${COLUMNS} from events where ${filter.text}${kindClause}${signalClause} order by occurred_at desc, rowid desc limit $limit`,
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
    return this.context.write(() => events.map((event) => this.insertOne(event, null)));
  }
  recordOccurrence(event: NewEvent, occurrence: string): EventAcknowledgment {
    return this.context.write(() => {
      const existing = this.context.sql.get(
        STORED_EVENT,
        `select ${COLUMNS} from events where occurrence_key = $occurrence`,
        { occurrence },
      );
      if (existing !== undefined) {
        this.enrich(existing.id, event.details);
        return { id: existing.id, inserted: false };
      }
      return { id: this.insertOne(event, occurrence).id, inserted: true };
    });
  }
  private insertOne(event: NewEvent, occurrence: string | null): EventRow {
    const id = this.context.newId();
    this.context.sql.run(
      'record the event',
      `insert into events (id, device_id, kind, occurred_at, details, created_at, occurrence_key)
      values ($id, $deviceId, $kind, $occurredAt, $details, $now, $occurrence)`,
      {
        id,
        deviceId: event.deviceId,
        kind: event.kind,
        occurredAt: moment(event.occurredAt),
        details: jsonText(event.details),
        now: this.context.now(),
        occurrence,
      },
    );
    const row = this.byId(id);
    this.context.changed('events', 'INSERT', row, null);
    return row;
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
