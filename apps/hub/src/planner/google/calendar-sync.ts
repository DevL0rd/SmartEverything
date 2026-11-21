import type { GoogleSyncTrigger } from '@smarteverything/domain';
import {
  applyEventsPage,
  classifyApiFailure,
  EventsPageSchema,
  eventsListQuery,
  type CalendarSyncState,
} from '@smarteverything/google';
import type { GoogleTokens } from '../../google/tokens';
import type { FetchLike } from '../../plugins/builtin/fetch-like';
import type { Store } from '../../store/store';
import type { Batch } from './calendar-batch';
import { CalendarMirror } from './calendar-list';
import { CalendarPusher } from './calendar-push';
import { GoogleCallError, Run, type Ctx, type RequestSpec } from './calendar-run';

export { GoogleCallError } from './calendar-run';

export interface CalendarSyncDeps {
  readonly store: Pick<Store, 'host'>;
  readonly tokens: Pick<GoogleTokens, 'accessToken' | 'invalidate'>;
  readonly fetch: FetchLike;
}

export class GoogleCalendarSync {
  private readonly pusher: CalendarPusher;
  private readonly mirror: CalendarMirror;

  constructor(private readonly deps: CalendarSyncDeps) {
    const request = <T>(spec: RequestSpec<T>): Promise<T> => this.request(spec);
    this.mirror = new CalendarMirror({ store: deps.store, request });
    this.pusher = new CalendarPusher({ store: deps.store, request });
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
      await this.deps.store.host.call('googleSyncLog', 'insert', {
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
    const { host } = this.deps.store;
    const resource = {
      profileId: ctx.run.profileId,
      product: 'calendar',
      resourceId: ctx.calendarId,
    } as const;
    try {
      await this.pull(
        ctx,
        (await host.call('googleSyncState', 'find', resource))?.sync_token ?? null,
      );
    } catch (cause) {
      if (!(cause instanceof GoogleCallError) || cause.failure.kind !== 'gone') throw cause;
      await host.call('googleSyncState', 'remove', resource);
      await this.pull(ctx, null);
    }
    if (!ctx.readOnly) await this.pusher.push(ctx);
  }

  private async pull(ctx: Ctx, token: string | null): Promise<void> {
    const batch = await this.fetchBatch(ctx, token);
    ctx.absorb(
      await this.deps.store.host.write('plannerGoogleCalendarPull', { ...ctx.scoped(), batch }),
    );
  }

  private async fetchBatch(ctx: Ctx, token: string | null): Promise<Batch> {
    const own = await this.deps.store.host.read('plannerGoogleCalendarEtags', {
      profileId: ctx.run.profileId,
      collectionId: ctx.collection.id,
    });
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
}
