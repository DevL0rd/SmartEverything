import type { FakeClock } from './clock';
import { EventCollection } from './calendar-events';
import { mergePatch, stringField, type JsonObject } from './json';
import { pageFeed, type FeedPage } from './paging';
import { apiFailure } from './reply';

export type AccessRole = 'freeBusyReader' | 'reader' | 'writer' | 'owner';

export interface CalendarSpec {
  readonly id: string;
  readonly summary: string;
  readonly accessRole?: AccessRole;
  readonly primary?: boolean;
  readonly timeZone?: string;
  readonly colorId?: string;
  readonly backgroundColor?: string;
  readonly foregroundColor?: string;
  readonly description?: string;
  readonly selected?: boolean;
  readonly hidden?: boolean;
}

export interface CalendarListQuery {
  readonly syncToken: string | null;
  readonly pageToken: string | null;
  readonly maxResults: number;
  readonly showDeleted: boolean;
  readonly showHidden: boolean;
}

export interface CalendarsDeps {
  readonly clock: FakeClock;
  readonly email: string;
  readonly nextServerId: () => number;
  readonly eventsChanged: (calendarId: string) => void;
  readonly listChanged: () => void;
}

interface ListRecord {
  readonly id: string;
  readonly rev: number;
  readonly resource: JsonObject;
}

const LIST_FEED = 'calendarList';
const LIST_SIGNATURE = 'calendarList';

export class AccountCalendars {
  private epoch = 1;
  private rev = 0;
  private readonly entries = new Map<string, ListRecord>();
  private readonly collections = new Map<string, EventCollection>();
  private readonly deps: CalendarsDeps;

  constructor(deps: CalendarsDeps) {
    this.deps = deps;
    this.add({ id: deps.email, summary: deps.email, primary: true });
  }

  add(spec: CalendarSpec): EventCollection {
    if (this.entries.has(spec.id)) throw new Error(`Calendar ${spec.id} already exists.`);
    const collection = new EventCollection({
      clock: this.deps.clock,
      calendarId: spec.id,
      nextServerId: this.deps.nextServerId,
      changed: (): void => {
        this.deps.eventsChanged(spec.id);
      },
    });
    this.collections.set(spec.id, collection);
    this.store(spec.id, entryOf(spec));
    this.deps.listChanged();
    return collection;
  }

  update(id: string, patch: JsonObject): void {
    const current = this.entry(id);
    this.store(id, mergePatch(current, patch));
    this.deps.listChanged();
  }

  remove(id: string): void {
    const current = this.entry(id);
    this.store(id, { ...current, deleted: true });
    this.deps.listChanged();
  }

  resolveId(id: string): string {
    return id === 'primary' ? this.deps.email : id;
  }

  entry(id: string): JsonObject {
    const record = this.entries.get(this.resolveId(id));
    if (record === undefined || record.resource['deleted'] === true) {
      throw apiFailure(404, 'Not Found', 'notFound');
    }
    return record.resource;
  }

  accessRole(id: string): string {
    return stringField(this.entry(id), 'accessRole') ?? 'reader';
  }

  events(id: string): EventCollection {
    const resolved = this.resolveId(id);
    this.entry(resolved);
    const collection = this.collections.get(resolved);
    if (collection === undefined) throw apiFailure(404, 'Not Found', 'notFound');
    return collection;
  }

  list(query: CalendarListQuery): FeedPage<JsonObject> {
    const page = pageFeed(
      {
        feed: LIST_FEED,
        epoch: this.epoch,
        currentRev: this.rev,
        syncToken: query.syncToken,
        pageToken: query.pageToken,
        maxResults: query.maxResults,
        showDeleted: query.showDeleted,
        signature: LIST_SIGNATURE,
      },
      [...this.entries.values()].filter((record) => query.showHidden || !isHidden(record)),
      (record) => record.resource['deleted'] === true,
    );
    return { ...page, items: page.items.map((record) => structuredClone(record.resource)) };
  }

  invalidateListTokens(): void {
    this.epoch += 1;
  }

  private store(id: string, resource: JsonObject): void {
    this.deps.clock.tick();
    this.rev += 1;
    const etag = `"${String(2_000_000_000 + this.rev)}000"`;
    this.entries.set(id, { id, rev: this.rev, resource: { ...resource, etag } });
  }
}

function isHidden(record: ListRecord): boolean {
  return record.resource['hidden'] === true;
}

function entryOf(spec: CalendarSpec): JsonObject {
  return {
    kind: 'calendar#calendarListEntry',
    id: spec.id,
    summary: spec.summary,
    timeZone: spec.timeZone ?? 'UTC',
    accessRole: spec.accessRole ?? 'owner',
    colorId: spec.colorId ?? '14',
    backgroundColor: spec.backgroundColor ?? '#9fe1e7',
    foregroundColor: spec.foregroundColor ?? '#000000',
    selected: spec.selected ?? true,
    defaultReminders: [],
    ...(spec.primary === true ? { primary: true } : {}),
    ...(spec.hidden === true ? { hidden: true } : {}),
    ...(spec.description === undefined ? {} : { description: spec.description }),
  };
}
