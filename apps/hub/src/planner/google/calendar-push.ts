import type { PlannerItemRow } from '@smarteverything/domain';
import {
  buildFieldPatch,
  deterministicEventId,
  eventInsertPath,
  eventPath,
  GoogleEventSchema,
  type FieldPatch,
  type GoogleEvent,
  type GoogleFailure,
} from '@smarteverything/google';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { Store } from '../../store/store';
import {
  EVENT_TYPE_KEY,
  PATCH_FIELDS,
  instanceId,
  isReadOnlyType,
  patchable,
} from './calendar-map';
import { GoogleCallError, type Ctx, type Requester } from './calendar-run';

const log = new Logger('hub.planner');

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

const SEND_UPDATES = 'sendUpdates=all';

function notifying(url: string): string {
  return `${url}${url.includes('?') ? '&' : '?'}${SEND_UPDATES}`;
}

export interface PushPorts {
  readonly store: Pick<Store, 'host'>;
  readonly request: Requester;
}

function failed(cause: unknown, ...kinds: GoogleFailure['kind'][]): boolean {
  return cause instanceof GoogleCallError && kinds.includes(cause.failure.kind);
}

function readOnlyItem(item: PlannerItemRow): boolean {
  if (item.google === null) return false;
  const type: unknown = Reflect.get(item.google.base, EVENT_TYPE_KEY);
  return typeof type === 'string' && isReadOnlyType(type);
}

export class CalendarPusher {
  constructor(private readonly ports: PushPorts) {}

  async push(ctx: Ctx): Promise<void> {
    const { trashed, live } = await this.ports.store.host.read('plannerGoogleCalendarPushable', {
      profileId: ctx.run.profileId,
      collectionId: ctx.collection.id,
    });
    for (const item of trashed) {
      await this.guard(ctx, item, () => this.remove(ctx, item));
    }
    for (const item of live) {
      await this.guard(ctx, item, () => this.pushItem(ctx, item, false));
    }
  }

  private async guard(ctx: Ctx, item: PlannerItemRow, work: () => Promise<void>): Promise<void> {
    try {
      await work();
    } catch (cause) {
      if (!(cause instanceof GoogleCallError) || cause.failure.kind !== 'rejected') throw cause;
      log.warn('Google rejected a calendar change', {
        item: item.id,
        message: cause.failure.message,
      });
      await this.markConflict(ctx, item.id);
    }
  }

  private markConflict(ctx: Ctx, id: string): Promise<void> {
    return this.ports.store.host.write('plannerGoogleCalendarConflict', {
      profileId: ctx.run.profileId,
      id,
    });
  }

  private async pushItem(ctx: Ctx, item: PlannerItemRow, retried: boolean): Promise<void> {
    const google = item.google;
    if (google === null) {
      await (item.series_id === null ? this.insert(ctx, item) : this.adoptInstance(ctx, item));
      return;
    }
    if (google.state === 'sending') {
      await this.insert(ctx, item);
      return;
    }
    if (readOnlyItem(item) || google.etag === null) return;
    const local = await this.ports.store.host.read('plannerGoogleCalendarFields', { item });
    const patch = buildFieldPatch({
      etag: google.etag,
      base: patchable(google.base),
      next: patchable(local),
      fields: PATCH_FIELDS,
    });
    if (patch !== null) await this.patch(ctx, item, patch, retried);
  }

  private settle(ctx: Ctx, item: PlannerItemRow, event: GoogleEvent): Promise<PlannerItemRow> {
    return this.ports.store.host.write('plannerGoogleCalendarSettle', {
      scope: ctx.scope(),
      item,
      event,
    });
  }

  private async insert(ctx: Ctx, item: PlannerItemRow): Promise<void> {
    const { profileId } = ctx.run;
    const id = item.google?.id ?? deterministicEventId(profileId, item.id);
    const sending = await this.ports.store.host.write('plannerGoogleCalendarSending', {
      scope: ctx.scope(),
      itemId: item.id,
      id,
    });
    const body = {
      ...sending.fields,
      id,
      extendedProperties: { private: { smarteverythingId: item.id } },
    };
    try {
      const event = await this.ports.request({
        profileId,
        method: 'POST',
        url: notifying(eventInsertPath(ctx.calendarId)),
        schema: GoogleEventSchema,
        body,
        headers: JSON_HEADERS,
      });
      await this.settle(ctx, sending.row, event);
      ctx.run.count('pushed');
    } catch (cause) {
      if (!failed(cause, 'already_exists')) throw cause;
      const event = await this.fetch(ctx, id);
      if (event === null) throw cause;
      await this.pushItem(ctx, await this.settle(ctx, sending.row, event), true);
    }
  }

  private async adoptInstance(ctx: Ctx, item: PlannerItemRow): Promise<void> {
    const master =
      item.series_id === null
        ? undefined
        : await this.ports.store.host.call(
            'plannerItems',
            'find',
            item.series_id,
            ctx.run.profileId,
          );
    const masterId = master?.google?.state === 'synced' ? master.google.id : null;
    if (master === undefined || masterId === null || item.original_start === null) return;
    const event = await this.fetch(
      ctx,
      instanceId(masterId, item.original_start, master.time_zone),
    );
    if (event === null) {
      log.warn('Skipped an exception Google does not know', { item: item.id });
      return;
    }
    await this.pushItem(ctx, await this.settle(ctx, item, event), false);
  }

  private async fetch(ctx: Ctx, id: string): Promise<GoogleEvent | null> {
    try {
      return await this.ports.request({
        profileId: ctx.run.profileId,
        method: 'GET',
        url: eventPath(ctx.calendarId, id),
        schema: GoogleEventSchema,
      });
    } catch (cause) {
      if (failed(cause, 'gone', 'not_found')) return null;
      throw cause;
    }
  }

  private async patch(
    ctx: Ctx,
    item: PlannerItemRow,
    patch: FieldPatch,
    retried: boolean,
  ): Promise<void> {
    const id = item.google?.id;
    if (typeof id !== 'string') return;
    try {
      const event = await this.ports.request({
        profileId: ctx.run.profileId,
        method: 'PATCH',
        url: notifying(eventPath(ctx.calendarId, id)),
        schema: GoogleEventSchema,
        body: patch.body,
        headers: patch.headers,
      });
      await this.settle(ctx, item, event);
      ctx.run.count('pushed');
    } catch (cause) {
      if (!failed(cause, 'precondition_failed')) throw cause;
      await this.afterPrecondition(ctx, item, id, retried);
    }
  }

  private async afterPrecondition(
    ctx: Ctx,
    item: PlannerItemRow,
    id: string,
    retried: boolean,
  ): Promise<void> {
    const { host } = this.ports.store;
    const { profileId } = ctx.run;
    const remote = await this.fetch(ctx, id);
    if (remote === null || remote.status === 'cancelled') {
      await host.call('plannerItems', 'update', item.id, profileId, { google: null });
      ctx.run.conflict({ item_id: item.id, field: 'deleted', winner: 'app', losing_value: true });
      return;
    }
    if (retried) {
      await this.markConflict(ctx, item.id);
      return;
    }
    const fresh = ctx.absorb(
      await host.write('plannerGoogleCalendarReconcile', { ...ctx.scoped(), item, remote }),
    );
    if (fresh !== undefined) await this.pushItem(ctx, fresh, true);
  }

  private async remove(ctx: Ctx, item: PlannerItemRow): Promise<void> {
    const { host } = this.ports.store;
    const google = item.google;
    const id = google?.id ?? null;
    if (google === null || id === null) {
      await host.call('plannerItems', 'purge', item.id, ctx.run.profileId);
      return;
    }
    try {
      await this.ports.request({
        profileId: ctx.run.profileId,
        method: 'DELETE',
        url: notifying(eventPath(ctx.calendarId, id)),
        schema: z.null(),
        headers: google.etag === null ? {} : { 'If-Match': google.etag },
      });
      ctx.run.count('pushed');
    } catch (cause) {
      if (failed(cause, 'precondition_failed')) {
        const remote = await this.fetch(ctx, id);
        ctx.absorb(
          await host.write('plannerGoogleCalendarDropLocal', {
            ...ctx.scoped(),
            item,
            remote,
            baseEtag: google.etag ?? '',
          }),
        );
        return;
      }
      if (!failed(cause, 'gone', 'not_found')) throw cause;
    }
    await host.call('plannerItems', 'purge', item.id, ctx.run.profileId);
  }
}
