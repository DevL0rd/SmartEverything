import {
  JSON_VALUE,
  type PlannerCollectionRow,
  type PlannerItemRow,
} from '@smarteverything/domain';
import {
  VENDOR_MAX_REMINDER_OVERRIDES,
  mergeFields,
  resolveLocalDelete,
  valuesEqual,
  type CalendarListEntry,
  type EventTombstone,
  type GoogleEvent,
} from '@smarteverything/google';
import { Logger } from '@smarteverything/logging';
import { z } from 'zod';
import type { PlannerItemInput } from '../../store/repositories/planner-items';
import type { HostStore } from '../../store/host/host-store';
import { jsonOr, recoverable, type Batch } from './calendar-batch';
import { guestsOfItem, pullAttendees } from './calendar-guests';
import {
  calendarName,
  colourKeyOf,
  eventFields,
  eventZone,
  isReadOnlyCalendar,
  itemFields,
  localOf,
  mappedItem,
  meetAttachments,
  patchable,
  recurrenceLines,
  type Fields,
} from './calendar-map';
import type { CalendarScope, Ctx } from './calendar-run';

const log = new Logger('hub.planner');

const FIELDS = z.record(z.string(), JSON_VALUE);

export interface MirroredCalendar {
  readonly scope: CalendarScope;
  readonly position: number;
}

function masterFirst(rows: readonly PlannerItemRow[]): PlannerItemRow[] {
  return [
    ...rows.filter((item) => item.series_id === null),
    ...rows.filter((item) => item.series_id !== null),
  ];
}

export class CalendarApplier {
  constructor(private readonly store: HostStore) {}

  private now(): Date {
    return new Date(this.store.context.now());
  }

  mirrorCalendars(
    profileId: string,
    entries: ReadonlyMap<string, CalendarListEntry>,
  ): MirroredCalendar[] {
    const { store } = this;
    const mirrored: MirroredCalendar[] = [];
    for (const id of store.googleAccounts.byProfile(profileId).calendar_ids) {
      const entry = entries.get(id);
      const known = store.plannerCollections.byGoogle(profileId, id);
      if (entry === undefined || entry.deleted === true) {
        if (known !== undefined) store.plannerCollections.remove(known.id, profileId);
        continue;
      }
      const collection = this.mirror(profileId, entry, known);
      const position = store.plannerItems
        .list(profileId, { collectionIds: [collection.id] })
        .reduce((top, item) => Math.max(top, item.position + 1), 0);
      mirrored.push({
        scope: {
          profileId,
          collection,
          calendarId: id,
          zone: entry.timeZone,
          readOnly: isReadOnlyCalendar(entry),
        },
        position,
      });
    }
    return mirrored;
  }

  ownEtags(profileId: string, collectionId: string): Map<string, string> {
    const own = new Map<string, string>();
    for (const item of this.store.plannerItems.list(profileId, { collectionIds: [collectionId] })) {
      const id = item.google?.id ?? null;
      const etag = item.google?.etag ?? null;
      if (id !== null && etag !== null) own.set(id, etag);
    }
    return own;
  }

  pull(ctx: Ctx, batch: Batch): void {
    this.applyBatch(ctx, batch);
    const { googleSyncState } = this.store;
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
      last_pull_at: this.now().toISOString(),
    });
  }

  pushable(
    profileId: string,
    collectionId: string,
  ): { readonly trashed: PlannerItemRow[]; readonly live: PlannerItemRow[] } {
    const { plannerItems } = this.store;
    const trashed = plannerItems
      .trashed(profileId)
      .filter((item) => item.collection_id === collectionId && item.google !== null);
    const live = plannerItems.list(profileId, { collectionIds: [collectionId] });
    return { trashed: masterFirst(trashed), live: masterFirst(live) };
  }

  markConflict(profileId: string, id: string): void {
    const { plannerItems } = this.store;
    const fresh = plannerItems.find(id, profileId);
    if (fresh !== undefined && fresh.google !== null) {
      plannerItems.update(id, profileId, { google: { ...fresh.google, state: 'conflict' } });
    }
  }

  sending(
    scope: CalendarScope,
    itemId: string,
    id: string,
  ): { readonly row: PlannerItemRow; readonly fields: Fields } {
    const row = this.store.plannerItems.update(itemId, scope.profileId, {
      google: { id, calendarOrListId: scope.calendarId, etag: null, base: {}, state: 'sending' },
    });
    return { row, fields: itemFields(row, guestsOfItem(this.store, row)) };
  }

  settle(scope: CalendarScope, item: PlannerItemRow, event: GoogleEvent): PlannerItemRow {
    const base = eventFields(event, eventZone(event, scope.zone));
    const settled = this.store.plannerItems.update(item.id, scope.profileId, {
      google: {
        id: event.id,
        calendarOrListId: scope.calendarId,
        etag: event.etag,
        base,
        state: 'synced',
      },
    });
    pullAttendees(this.store, {
      item: settled,
      event,
      merged: base,
      at: this.now().toISOString(),
    });
    return settled;
  }

  localFields(item: PlannerItemRow): Fields {
    return itemFields(item, guestsOfItem(this.store, item));
  }

  reconcileRemote(ctx: Ctx, item: PlannerItemRow, remote: GoogleEvent): PlannerItemRow | undefined {
    this.reconcile(ctx, item, remote, eventFields(remote, eventZone(remote, ctx.zone)));
    return this.store.plannerItems.find(item.id, ctx.run.profileId);
  }

  dropLocal(ctx: Ctx, item: PlannerItemRow, remote: GoogleEvent | null, baseEtag: string): void {
    this.store.plannerItems.purge(item.id, ctx.run.profileId);
    if (remote === null) return;
    const outcome = resolveLocalDelete({
      baseEtag,
      remoteEtag: remote.etag,
      remoteDeleted: remote.status === 'cancelled',
    });
    if (outcome !== 'resurrect') return;
    this.create(ctx, remote, eventFields(remote, eventZone(remote, ctx.zone)));
    ctx.run.conflict({ item_id: item.id, field: 'deleted', winner: 'google', losing_value: true });
  }

  private mirror(
    profileId: string,
    entry: CalendarListEntry,
    known: PlannerCollectionRow | undefined,
  ): PlannerCollectionRow {
    const { plannerCollections } = this.store;
    const google = { id: entry.id, etag: entry.etag ?? null, syncToken: null };
    if (known === undefined) {
      const position = plannerCollections
        .list(profileId)
        .reduce((top, row) => Math.max(top, row.position + 1), 0);
      return plannerCollections.insert({
        profile_id: profileId,
        kind: 'calendar',
        name: calendarName(entry),
        colour: colourKeyOf(entry.backgroundColor),
        icon: 'calendar',
        position,
        visible: entry.selected !== false,
        default_reminders: [],
        audience: 'personal',
        source: 'google',
        google,
        feed: null,
      });
    }
    if (known.google?.etag === google.etag) return known;
    return plannerCollections.update(known.id, profileId, {
      name: calendarName(entry),
      google: { ...google, syncToken: known.google?.syncToken ?? null },
    });
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
    const { plannerItems } = this.store;
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
    const { plannerItems } = this.store;
    const master =
      event.recurringEventId === undefined
        ? undefined
        : plannerItems.byGoogle(ctx.run.profileId, ctx.calendarId, event.recurringEventId)[0];
    if (event.recurringEventId !== undefined && master === undefined) {
      log.warn('Skipped an exception whose series is unknown', { event: event.id });
      return;
    }
    const created = plannerItems.insert(this.newItem(ctx, event, fields, master));
    this.takeAttendees(created, event, fields);
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
      assignee_id: null,
      ical_uid: event.iCalUID ?? null,
      ical_sequence: event.sequence ?? 0,
      booking_page_id: null,
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
    const mine = this.mineOf(item);
    const base = patchable(google.base);
    const theirs = patchable(fields);
    let target: Fields = theirs;
    if (!valuesEqual(mine, base)) {
      const merge = mergeFields({
        base,
        mine,
        theirs,
        mineUpdatedAt: Date.parse(item.updated_at),
        theirsUpdatedAt: Date.parse(event.updated ?? this.now().toISOString()),
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
    const updated = this.store.plannerItems.update(item.id, ctx.run.profileId, {
      ...mappedItem(target, item.reminders.slice(VENDOR_MAX_REMINDER_OVERRIDES)),
      attachments: meetAttachments(event, item.attachments),
      google: this.link(ctx, event, fields),
    });
    this.takeAttendees(updated, event, target);
    ctx.run.count('updated');
  }

  private applyTombstone(ctx: Ctx, entry: EventTombstone): void {
    const { plannerItems } = this.store;
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

  private takeAttendees(item: PlannerItemRow, event: GoogleEvent, merged: Fields): void {
    pullAttendees(this.store, { item, event, merged, at: this.now().toISOString() });
  }

  private mineOf(item: PlannerItemRow): Fields {
    return patchable(this.localFields(item));
  }

  private edited(item: PlannerItemRow): boolean {
    return item.google !== null && !valuesEqual(this.mineOf(item), patchable(item.google.base));
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
    this.store.plannerItems.update(master.id, ctx.run.profileId, {
      exdates,
      google: { ...google, base: { ...google.base, recurrence: [...lines] } },
    });
  }

  private dropUnseen(ctx: Ctx, seen: ReadonlySet<string>): void {
    const items = this.store.plannerItems.list(ctx.run.profileId, {
      collectionIds: [ctx.collection.id],
    });
    for (const item of items) {
      const id = item.google?.id ?? null;
      if (id === null || item.google?.state === 'sending' || seen.has(id)) continue;
      this.applyTombstone(ctx, { id, recurringEventId: null, originalStartTime: null });
    }
  }
}
