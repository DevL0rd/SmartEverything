import {
  JSON_VALUE,
  type GoogleSyncTrigger,
  type JsonValue,
  type PlannerItemRow,
} from '@smarteverything/domain';
import {
  EventsPageSchema,
  VENDOR_MAX_REMINDER_OVERRIDES,
  applyEventsPage,
  classifyApiFailure,
  eventsListQuery,
  mergeFields,
  valuesEqual,
  type CalendarSyncState,
  type EventTombstone,
  type GoogleEvent,
} from '@smarteverything/google';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { GoogleTokens } from '../../google/tokens';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import type { PlannerItemInput } from '../../store/repositories/planner-items';
import type { Store } from '../../store/store';
import { CalendarMirror } from './calendar-list';
import {
  MapError,
  eventFields,
  eventZone,
  itemFields,
  localOf,
  mappedItem,
  meetAttachments,
  patchable,
  recurrenceLines,
  type Fields,
} from './calendar-map';
import { CalendarPusher } from './calendar-push';
import { GoogleCallError, Run, type Ctx, type RequestSpec } from './calendar-run';

export { GoogleCallError } from './calendar-run';

const log = new Logger('hub.planner');

const FIELDS = z.record(z.string(), JSON_VALUE);

export interface CalendarSyncDeps {
  readonly store: Pick<
    Store,
    'plannerItems' | 'plannerCollections' | 'googleAccounts' | 'googleSyncState' | 'googleSyncLog'
  >;
  readonly tokens: Pick<GoogleTokens, 'accessToken' | 'invalidate'>;
  readonly fetch: FetchLike;
  readonly now: () => Date;
}

interface Batch {
  readonly upserts: GoogleEvent[];
  readonly tombstones: EventTombstone[];
  readonly seen: Set<string>;
  readonly full: boolean;
  syncToken: string | null;
}

function jsonOr(value: unknown): JsonValue {
  const parsed = JSON_VALUE.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function recoverable(cause: unknown): boolean {
  return cause instanceof MapError || cause instanceof RangeError;
}

export class GoogleCalendarSync {
  private readonly pusher: CalendarPusher;
  private readonly mirror: CalendarMirror;

  constructor(private readonly deps: CalendarSyncDeps) {
    const request = <T>(spec: RequestSpec<T>): Promise<T> => this.request(spec);
    this.mirror = new CalendarMirror({ store: deps.store, request });
    this.pusher = new CalendarPusher({
      store: deps.store,
      request,
      reconcile: (ctx, item, event, fields): void => {
        this.reconcile(ctx, item, event, fields);
      },
      create: (ctx, event, fields): void => {
        this.create(ctx, event, fields);
      },
    });
  }

  async sync(profileId: string, trigger: GoogleSyncTrigger): Promise<Run> {
    const run = new Run(profileId);
    let error: string | null = null;
    try {
      for (const ctx of await this.mirror.contexts(run)) await this.syncCalendar(ctx);
    } catch (cause) {
      error = cause instanceof Error ? cause.message : String(cause);
      throw cause;
    } finally {
      this.deps.store.googleSyncLog.insert({
        profile_id: profileId,
        trigger,
        product: 'calendar',
        counts: run.counts(),
        conflicts: run.conflicts,
        error,
        choice: null,
      });
    }
    return run;
  }

  private async request<T>(spec: RequestSpec<T>): Promise<T> {
    for (let attempt = 0; ; attempt += 1) {
      const token = await this.deps.tokens.accessToken(spec.profileId);
      const response = await this.deps.fetch(spec.url, {
        method: spec.method,
        headers: { Authorization: `Bearer ${token}`, ...spec.headers },
        ...(spec.body === undefined ? {} : { body: JSON.stringify(spec.body) }),
      });
      const text = await response.text();
      const body: unknown = text === '' ? null : JSON.parse(text);
      if (response.ok) return spec.schema.parse(body);
      const failure = classifyApiFailure(response.status, body);
      if (failure.kind !== 'unauthorized' || attempt > 0) throw new GoogleCallError(failure);
      this.deps.tokens.invalidate(spec.profileId);
    }
  }

  private async syncCalendar(ctx: Ctx): Promise<void> {
    const { googleSyncState } = this.deps.store;
    const resource = {
      profileId: ctx.run.profileId,
      product: 'calendar',
      resourceId: ctx.calendarId,
    } as const;
    try {
      await this.pull(ctx, googleSyncState.find(resource)?.sync_token ?? null);
    } catch (cause) {
      if (!(cause instanceof GoogleCallError) || cause.failure.kind !== 'gone') throw cause;
      googleSyncState.remove(resource);
      await this.pull(ctx, null);
    }
    if (!ctx.readOnly) await this.pusher.push(ctx);
  }

  private async pull(ctx: Ctx, token: string | null): Promise<void> {
    const batch = await this.fetchBatch(ctx, token);
    this.applyBatch(ctx, batch);
    const { googleSyncState } = this.deps.store;
    const resource = {
      profileId: ctx.run.profileId,
      product: 'calendar',
      resourceId: ctx.calendarId,
    } as const;
    googleSyncState.put({
      profile_id: ctx.run.profileId,
      product: 'calendar',
      resource_id: ctx.calendarId,
      sync_token: batch.syncToken,
      channel: googleSyncState.find(resource)?.channel ?? null,
      last_pull_at: this.deps.now().toISOString(),
    });
  }

  private async fetchBatch(ctx: Ctx, token: string | null): Promise<Batch> {
    const own = this.ownEtags(ctx);
    const batch: Batch = {
      upserts: [],
      tombstones: [],
      seen: new Set(),
      full: token === null,
      syncToken: token,
    };
    let state: CalendarSyncState = { syncToken: token, pageToken: null };
    for (;;) {
      const page = await this.request({
        profileId: ctx.run.profileId,
        method: 'GET',
        url: eventsListQuery({
          calendarId: ctx.calendarId,
          syncToken: state.syncToken ?? undefined,
          pageToken: state.pageToken ?? undefined,
        }),
        schema: EventsPageSchema,
      });
      const result = applyEventsPage(state, page, own);
      batch.upserts.push(...result.upserts);
      batch.tombstones.push(...result.tombstones);
      for (const event of page.items) batch.seen.add(event.id);
      state = result.state;
      if (result.complete) break;
    }
    batch.syncToken = state.syncToken;
    return batch;
  }

  private ownEtags(ctx: Ctx): Map<string, string> {
    const own = new Map<string, string>();
    const items = this.deps.store.plannerItems.list(ctx.run.profileId, {
      collectionIds: [ctx.collection.id],
    });
    for (const item of items) {
      const id = item.google?.id ?? null;
      const etag = item.google?.etag ?? null;
      if (id !== null && etag !== null) own.set(id, etag);
    }
    return own;
  }

  private applyBatch(ctx: Ctx, batch: Batch): void {
    ctx.run.count('pulled', batch.upserts.length + batch.tombstones.length);
    const masters = batch.upserts.filter((event) => event.recurringEventId === undefined);
    const exceptions = batch.upserts.filter((event) => event.recurringEventId !== undefined);
    for (const event of [...masters, ...exceptions]) {
      try {
        this.applyUpsert(ctx, event);
      } catch (cause) {
        if (!recoverable(cause)) throw cause;
        log.warn('Skipped a Google event that cannot be shown', { event: event.id });
      }
    }
    const plain = batch.tombstones.filter((entry) => entry.recurringEventId === null);
    const instances = batch.tombstones.filter((entry) => entry.recurringEventId !== null);
    for (const entry of [...plain, ...instances]) this.applyTombstone(ctx, entry);
    if (batch.full) this.dropUnseen(ctx, batch.seen);
  }

  private locate(ctx: Ctx, event: GoogleEvent): PlannerItemRow | undefined {
    const { plannerItems } = this.deps.store;
    const { profileId } = ctx.run;
    const linked = plannerItems.byGoogle(profileId, ctx.calendarId, event.id)[0];
    if (linked !== undefined) return linked;
    const own = event.extendedProperties?.private?.['smarteverythingId'];
    const local = own === undefined ? undefined : plannerItems.find(own, profileId);
    return local !== undefined && (local.google?.etag ?? null) === null ? local : undefined;
  }

  private applyUpsert(ctx: Ctx, event: GoogleEvent): void {
    const fields = eventFields(event, eventZone(event, ctx.zone));
    const item = this.locate(ctx, event);
    if (item === undefined) this.create(ctx, event, fields);
    else this.reconcile(ctx, item, event, fields);
  }

  private create(ctx: Ctx, event: GoogleEvent, fields: Fields): void {
    const { plannerItems } = this.deps.store;
    const master =
      event.recurringEventId === undefined
        ? undefined
        : plannerItems.byGoogle(ctx.run.profileId, ctx.calendarId, event.recurringEventId)[0];
    if (event.recurringEventId !== undefined && master === undefined) {
      log.warn('Skipped an exception whose series is unknown', { event: event.id });
      return;
    }
    plannerItems.insert(this.newItem(ctx, event, fields, master));
    ctx.run.count('created');
  }

  private newItem(
    ctx: Ctx,
    event: GoogleEvent,
    fields: Fields,
    master: PlannerItemRow | undefined,
  ): PlannerItemInput {
    return {
      ...mappedItem(fields, []),
      profile_id: ctx.run.profileId,
      collection_id: ctx.collection.id,
      kind: 'event',
      parent_id: null,
      priority: null,
      tags: [],
      estimate_minutes: null,
      due_date: null,
      due_at: null,
      series_id: master?.id ?? null,
      original_start:
        master === undefined ? null : localOf(event.originalStartTime, master.time_zone),
      status: 'open',
      position: ctx.next(),
      completion: { kind: 'manual' },
      attachments: meetAttachments(event, []),
      google: this.link(ctx, event, fields),
      created_by: 'google',
    };
  }

  private link(
    ctx: Ctx,
    event: GoogleEvent,
    fields: Fields,
  ): NonNullable<PlannerItemRow['google']> {
    return {
      id: event.id,
      calendarOrListId: ctx.calendarId,
      etag: event.etag,
      base: fields,
      state: 'synced',
    };
  }

  private reconcile(ctx: Ctx, item: PlannerItemRow, event: GoogleEvent, fields: Fields): void {
    const google = item.google;
    if (item.deleted_at !== null || google === null || google.etag === event.etag) return;
    const mine = patchable(itemFields(item));
    const base = patchable(google.base);
    const theirs = patchable(fields);
    let target: Fields = theirs;
    if (!valuesEqual(mine, base)) {
      const merge = mergeFields({
        base,
        mine,
        theirs,
        mineUpdatedAt: Date.parse(item.updated_at),
        theirsUpdatedAt: Date.parse(event.updated ?? this.deps.now().toISOString()),
      });
      target = FIELDS.parse(merge.merged);
      for (const conflict of merge.conflicts) {
        ctx.run.conflict({
          item_id: item.id,
          field: conflict.field,
          winner: conflict.winner === 'mine' ? 'app' : 'google',
          losing_value: jsonOr(conflict.lost),
        });
      }
    }
    this.deps.store.plannerItems.update(item.id, ctx.run.profileId, {
      ...mappedItem(target, item.reminders.slice(VENDOR_MAX_REMINDER_OVERRIDES)),
      attachments: meetAttachments(event, item.attachments),
      google: this.link(ctx, event, fields),
    });
    ctx.run.count('updated');
  }

  private applyTombstone(ctx: Ctx, entry: EventTombstone): void {
    const { plannerItems } = this.deps.store;
    const { profileId } = ctx.run;
    const own = plannerItems.byGoogle(profileId, ctx.calendarId, entry.id)[0];
    if (own !== undefined) {
      const edited = own.deleted_at === null && this.edited(own);
      if (entry.recurringEventId === null && edited) {
        plannerItems.update(own.id, profileId, { google: null });
        ctx.run.conflict({ item_id: own.id, field: 'deleted', winner: 'app', losing_value: true });
      } else {
        plannerItems.purge(own.id, profileId);
        ctx.run.count('deleted');
      }
    }
    if (entry.recurringEventId === null || entry.originalStartTime === null) return;
    const master = plannerItems.byGoogle(profileId, ctx.calendarId, entry.recurringEventId)[0];
    if (master !== undefined) this.exclude(ctx, master, entry.originalStartTime);
  }

  private edited(item: PlannerItemRow): boolean {
    return (
      item.google !== null && !valuesEqual(patchable(itemFields(item)), patchable(item.google.base))
    );
  }

  private exclude(
    ctx: Ctx,
    master: PlannerItemRow,
    original: EventTombstone['originalStartTime'],
  ): void {
    const google = master.google;
    if (google === null || master.rrule === null || original === null) return;
    const local = localOf(original, master.time_zone);
    if (master.exdates.includes(local)) return;
    const exdates = [...master.exdates, local];
    const lines = recurrenceLines(master.rrule, exdates, master.time_zone);
    this.deps.store.plannerItems.update(master.id, ctx.run.profileId, {
      exdates,
      google: { ...google, base: { ...google.base, recurrence: [...lines] } },
    });
  }

  private dropUnseen(ctx: Ctx, seen: ReadonlySet<string>): void {
    const items = this.deps.store.plannerItems.list(ctx.run.profileId, {
      collectionIds: [ctx.collection.id],
    });
    for (const item of items) {
      const id = item.google?.id ?? null;
      if (id === null || item.google?.state === 'sending' || seen.has(id)) continue;
      this.applyTombstone(ctx, { id, recurringEventId: null, originalStartTime: null });
    }
  }
}
