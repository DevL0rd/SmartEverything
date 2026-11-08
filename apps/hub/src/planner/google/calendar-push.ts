import type { PlannerItemRow } from '@smarteverything/domain';
import {
  GoogleEventSchema,
  buildFieldPatch,
  deterministicEventId,
  eventInsertPath,
  eventPath,
  resolveLocalDelete,
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
  eventFields,
  eventZone,
  instanceId,
  isReadOnlyType,
  itemFields,
  patchable,
  type Fields,
} from './calendar-map';
import { GoogleCallError, type Ctx, type Requester } from './calendar-run';

const log = new Logger('hub.planner');

const JSON_HEADERS = { 'Content-Type': 'application/json' } as const;

export interface PushPorts {
  readonly store: Pick<Store, 'plannerItems'>;
  readonly request: Requester;
  readonly reconcile: (ctx: Ctx, item: PlannerItemRow, event: GoogleEvent, fields: Fields) => void;
  readonly create: (ctx: Ctx, event: GoogleEvent, fields: Fields) => void;
}

function failed(cause: unknown, ...kinds: GoogleFailure['kind'][]): boolean {
  return cause instanceof GoogleCallError && kinds.includes(cause.failure.kind);
}

function readOnlyItem(item: PlannerItemRow): boolean {
  if (item.google === null) return false;
  const type: unknown = Reflect.get(item.google.base, EVENT_TYPE_KEY);
  return typeof type === 'string' && isReadOnlyType(type);
}

function masterFirst(rows: readonly PlannerItemRow[]): PlannerItemRow[] {
  return [
    ...rows.filter((item) => item.series_id === null),
    ...rows.filter((item) => item.series_id !== null),
  ];
}

export class CalendarPusher {
  constructor(private readonly ports: PushPorts) {}

  async push(ctx: Ctx): Promise<void> {
    const { plannerItems } = this.ports.store;
    const { profileId } = ctx.run;
    const trashed = plannerItems
      .trashed(profileId)
      .filter((item) => item.collection_id === ctx.collection.id && item.google !== null);
    const live = plannerItems.list(profileId, { collectionIds: [ctx.collection.id] });
    for (const item of masterFirst(trashed)) {
      await this.guard(ctx, item, () => this.remove(ctx, item));
    }
    for (const item of masterFirst(live)) {
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
      this.markConflict(ctx, item.id);
    }
  }

  private markConflict(ctx: Ctx, id: string): void {
    const { plannerItems } = this.ports.store;
    const fresh = plannerItems.find(id, ctx.run.profileId);
    if (fresh !== undefined && fresh.google !== null) {
      plannerItems.update(id, ctx.run.profileId, {
        google: { ...fresh.google, state: 'conflict' },
      });
    }
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
    const patch = buildFieldPatch({
      etag: google.etag,
      base: patchable(google.base),
      next: patchable(itemFields(item)),
      fields: PATCH_FIELDS,
    });
    if (patch !== null) await this.patch(ctx, item, patch, retried);
  }

  private settle(ctx: Ctx, item: PlannerItemRow, event: GoogleEvent): PlannerItemRow {
    return this.ports.store.plannerItems.update(item.id, ctx.run.profileId, {
      google: {
        id: event.id,
        calendarOrListId: ctx.calendarId,
        etag: event.etag,
        base: eventFields(event, eventZone(event, ctx.zone)),
        state: 'synced',
      },
    });
  }

  private async insert(ctx: Ctx, item: PlannerItemRow): Promise<void> {
    const { profileId } = ctx.run;
    const id = item.google?.id ?? deterministicEventId(profileId, item.id);
    const sending = this.ports.store.plannerItems.update(item.id, profileId, {
      google: { id, calendarOrListId: ctx.calendarId, etag: null, base: {}, state: 'sending' },
    });
    const body = {
      ...itemFields(sending),
      id,
      extendedProperties: { private: { smarteverythingId: item.id } },
    };
    try {
      const event = await this.ports.request({
        profileId,
        method: 'POST',
        url: eventInsertPath(ctx.calendarId),
        schema: GoogleEventSchema,
        body,
        headers: JSON_HEADERS,
      });
      this.settle(ctx, sending, event);
      ctx.run.count('pushed');
    } catch (cause) {
      if (!failed(cause, 'already_exists')) throw cause;
      const event = await this.fetch(ctx, id);
      if (event === null) throw cause;
      await this.pushItem(ctx, this.settle(ctx, sending, event), true);
    }
  }

  private async adoptInstance(ctx: Ctx, item: PlannerItemRow): Promise<void> {
    const master =
      item.series_id === null
        ? undefined
        : this.ports.store.plannerItems.find(item.series_id, ctx.run.profileId);
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
    await this.pushItem(ctx, this.settle(ctx, item, event), false);
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
        url: eventPath(ctx.calendarId, id),
        schema: GoogleEventSchema,
        body: patch.body,
        headers: patch.headers,
      });
      this.settle(ctx, item, event);
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
    const { plannerItems } = this.ports.store;
    const { profileId } = ctx.run;
    const remote = await this.fetch(ctx, id);
    if (remote === null || remote.status === 'cancelled') {
      plannerItems.update(item.id, profileId, { google: null });
      ctx.run.conflict({ item_id: item.id, field: 'deleted', winner: 'app', losing_value: true });
      return;
    }
    if (retried) {
      this.markConflict(ctx, item.id);
      return;
    }
    this.ports.reconcile(ctx, item, remote, eventFields(remote, eventZone(remote, ctx.zone)));
    const fresh = plannerItems.find(item.id, profileId);
    if (fresh !== undefined) await this.pushItem(ctx, fresh, true);
  }

  private async remove(ctx: Ctx, item: PlannerItemRow): Promise<void> {
    const google = item.google;
    const id = google?.id ?? null;
    if (google === null || id === null) {
      this.ports.store.plannerItems.purge(item.id, ctx.run.profileId);
      return;
    }
    try {
      await this.ports.request({
        profileId: ctx.run.profileId,
        method: 'DELETE',
        url: eventPath(ctx.calendarId, id),
        schema: z.null(),
        headers: google.etag === null ? {} : { 'If-Match': google.etag },
      });
      ctx.run.count('pushed');
    } catch (cause) {
      if (failed(cause, 'precondition_failed')) {
        await this.resolveDelete(ctx, item, id, google.etag ?? '');
        return;
      }
      if (!failed(cause, 'gone', 'not_found')) throw cause;
    }
    this.ports.store.plannerItems.purge(item.id, ctx.run.profileId);
  }

  private async resolveDelete(
    ctx: Ctx,
    item: PlannerItemRow,
    id: string,
    baseEtag: string,
  ): Promise<void> {
    const remote = await this.fetch(ctx, id);
    this.ports.store.plannerItems.purge(item.id, ctx.run.profileId);
    if (remote === null) return;
    const outcome = resolveLocalDelete({
      baseEtag,
      remoteEtag: remote.etag,
      remoteDeleted: remote.status === 'cancelled',
    });
    if (outcome !== 'resurrect') return;
    this.ports.create(ctx, remote, eventFields(remote, eventZone(remote, ctx.zone)));
    ctx.run.conflict({ item_id: item.id, field: 'deleted', winner: 'google', losing_value: true });
  }
}
