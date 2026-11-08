import type { FakeClock } from './clock';
import {
  buildInstance,
  parseInstanceId,
  serverEventId,
  tombstoneOf,
  validateEvent,
  validateEventId,
  writableFields,
} from './event-resource';
import { mergePatch, numberField, stringField, type JsonObject } from './json';
import { pageFeed, type FeedPage } from './paging';
import { apiFailure, checkIfMatch } from './reply';

interface EventRecord {
  readonly id: string;
  readonly rev: number;
  readonly resource: JsonObject;
}

interface Stamp {
  readonly etag: string;
  readonly updated: string;
}

export interface EventsDeps {
  readonly clock: FakeClock;
  readonly calendarId: string;
  readonly nextServerId: () => number;
  readonly changed: () => void;
}

export interface EventsQuery {
  readonly syncToken: string | null;
  readonly pageToken: string | null;
  readonly maxResults: number;
  readonly showDeleted: boolean;
}

const EVENT_STATUSES = new Set(['confirmed', 'tentative', 'cancelled']);
const LIST_SIGNATURE = 'singleEvents=false';

export class EventCollection {
  private epoch = 1;
  private rev = 0;
  private readonly records = new Map<string, EventRecord>();
  private readonly deps: EventsDeps;

  constructor(deps: EventsDeps) {
    this.deps = deps;
  }

  insert(body: JsonObject): JsonObject {
    const given = stringField(body, 'id');
    if (given !== undefined) {
      validateEventId(given);
      if (this.records.has(given)) {
        throw apiFailure(409, 'The requested identifier already exists.', 'duplicate');
      }
    }
    const status = stringField(body, 'status') ?? 'confirmed';
    if (!EVENT_STATUSES.has(status)) throw apiFailure(400, 'Invalid value for: status', 'invalid');
    const id = given ?? serverEventId(this.deps.nextServerId());
    const resource = this.newResource(id, body);
    validateEvent(resource);
    const stored = this.write(id, (stamp) => ({ ...resource, ...stamp }));
    this.deps.changed();
    return structuredClone(stored);
  }

  private newResource(id: string, body: JsonObject): JsonObject {
    const owner = { email: this.deps.calendarId, self: true };
    return {
      kind: 'calendar#event',
      id,
      status: 'confirmed',
      eventType: 'default',
      reminders: { useDefault: true },
      iCalUID: `${id}@google.com`,
      sequence: 0,
      created: this.deps.clock.iso(),
      creator: owner,
      organizer: owner,
      htmlLink: `https://www.google.com/calendar/event?eid=${id}`,
      ...writableFields(body),
    };
  }

  get(id: string): JsonObject {
    return structuredClone(this.current(id));
  }

  patch(id: string, body: JsonObject, ifMatch: string | null): JsonObject {
    const current = this.current(id);
    checkIfMatch(stringField(current, 'etag') ?? '', ifMatch);
    const merged = mergePatch(current, writableFields(body));
    validateEvent(merged);
    const sequence = (numberField(current, 'sequence') ?? 0) + 1;
    const stored = this.write(id, (stamp) => ({ ...merged, sequence, ...stamp }));
    this.deps.changed();
    return structuredClone(stored);
  }

  remove(id: string, ifMatch: string | null): void {
    const current = this.current(id);
    checkIfMatch(stringField(current, 'etag') ?? '', ifMatch);
    this.cancel(id, current);
    if (stringField(current, 'recurringEventId') === undefined) this.cancelExceptionsOf(id);
    this.deps.changed();
  }

  list(query: EventsQuery): FeedPage<JsonObject> {
    const page = pageFeed(
      {
        feed: this.deps.calendarId,
        epoch: this.epoch,
        currentRev: this.rev,
        syncToken: query.syncToken,
        pageToken: query.pageToken,
        maxResults: query.maxResults,
        showDeleted: query.showDeleted,
        signature: LIST_SIGNATURE,
      },
      [...this.records.values()],
      (record) => record.resource['status'] === 'cancelled',
    );
    return { ...page, items: page.items.map((record) => structuredClone(record.resource)) };
  }

  invalidateSyncTokens(): void {
    this.epoch += 1;
  }

  snapshot(): readonly JsonObject[] {
    return [...this.records.values()].map((record) => structuredClone(record.resource));
  }

  private current(id: string): JsonObject {
    const stored = this.records.get(id);
    if (stored !== undefined) {
      if (stored.resource['status'] === 'cancelled') {
        throw apiFailure(410, 'Resource has been deleted', 'deleted');
      }
      return stored.resource;
    }
    const instance = this.virtualInstance(id);
    if (instance === null) throw apiFailure(404, 'Not Found', 'notFound');
    return instance;
  }

  private virtualInstance(id: string): JsonObject | null {
    const reference = parseInstanceId(id);
    const master = reference === null ? undefined : this.records.get(reference.masterId)?.resource;
    if (reference === null || master === undefined || master['status'] === 'cancelled') return null;
    const etag = (stringField(master, 'etag') ?? '').replace(/"$/, '-i"');
    return buildInstance(master, id, reference.suffix, etag);
  }

  private cancel(id: string, resource: JsonObject): void {
    this.write(id, (stamp) => tombstoneOf(resource, stamp.etag));
  }

  private cancelExceptionsOf(masterId: string): void {
    for (const record of [...this.records.values()]) {
      const cancelled = record.resource['status'] === 'cancelled';
      if (!cancelled && stringField(record.resource, 'recurringEventId') === masterId) {
        this.cancel(record.id, record.resource);
      }
    }
  }

  private write(id: string, build: (stamp: Stamp) => JsonObject): JsonObject {
    this.deps.clock.tick();
    this.rev += 1;
    const stamp: Stamp = {
      etag: `"${String(1_000_000_000 + this.rev)}000"`,
      updated: this.deps.clock.iso(),
    };
    const resource = build(stamp);
    this.records.set(id, { id, rev: this.rev, resource });
    return resource;
  }
}
