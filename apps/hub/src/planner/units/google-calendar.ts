import type { PlannerItemRow } from '@smarteverything/domain';
import type { CalendarListEntry, GoogleEvent } from '@smarteverything/google';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { CalendarApplier, type MirroredCalendar } from '../google/calendar-apply';
import type { Batch } from '../google/calendar-batch';
import type { Fields } from '../google/calendar-map';
import {
  scopedCtx,
  type CalendarScope,
  type Ctx,
  type ScopedInput,
  type ScopedOutcome,
} from '../google/calendar-run';

export interface Collection {
  readonly profileId: string;
  readonly collectionId: string;
}

export interface CalendarItemInput extends ScopedInput {
  readonly item: PlannerItemRow;
}

function scoped<T>(
  store: HostStore,
  input: ScopedInput,
  work: (applier: CalendarApplier, ctx: Ctx) => T,
): ScopedOutcome<T> {
  const ctx = scopedCtx(input);
  return ctx.outcome(work(new CalendarApplier(store), ctx));
}

export const PLANNER_GOOGLE_CALENDAR_READ_UNITS = {
  plannerGoogleCalendarEtags: storeUnit(
    (store, { profileId, collectionId }: Collection): Map<string, string> =>
      new CalendarApplier(store).ownEtags(profileId, collectionId),
  ),
  plannerGoogleCalendarPushable: storeUnit((store, { profileId, collectionId }: Collection) =>
    new CalendarApplier(store).pushable(profileId, collectionId),
  ),
  plannerGoogleCalendarFields: storeUnit(
    (store, { item }: { readonly item: PlannerItemRow }): Fields =>
      new CalendarApplier(store).localFields(item),
  ),
} as const;

export const PLANNER_GOOGLE_CALENDAR_WRITE_UNITS = {
  plannerGoogleCalendarMirror: storeUnit(
    (
      store,
      {
        profileId,
        entries,
      }: { readonly profileId: string; readonly entries: ReadonlyMap<string, CalendarListEntry> },
    ): MirroredCalendar[] => new CalendarApplier(store).mirrorCalendars(profileId, entries),
  ),
  plannerGoogleCalendarPull: storeUnit((store, input: ScopedInput & { readonly batch: Batch }) =>
    scoped(store, input, (applier, ctx) => {
      applier.pull(ctx, input.batch);
    }),
  ),
  plannerGoogleCalendarConflict: storeUnit(
    (store, { profileId, id }: { readonly profileId: string; readonly id: string }): void => {
      new CalendarApplier(store).markConflict(profileId, id);
    },
  ),
  plannerGoogleCalendarSending: storeUnit(
    (
      store,
      {
        scope,
        itemId,
        id,
      }: { readonly scope: CalendarScope; readonly itemId: string; readonly id: string },
    ) => new CalendarApplier(store).sending(scope, itemId, id),
  ),
  plannerGoogleCalendarSettle: storeUnit(
    (
      store,
      {
        scope,
        item,
        event,
      }: {
        readonly scope: CalendarScope;
        readonly item: PlannerItemRow;
        readonly event: GoogleEvent;
      },
    ): PlannerItemRow => new CalendarApplier(store).settle(scope, item, event),
  ),
  plannerGoogleCalendarReconcile: storeUnit(
    (store, input: CalendarItemInput & { readonly remote: GoogleEvent }) =>
      scoped(store, input, (applier, ctx) =>
        applier.reconcileRemote(ctx, input.item, input.remote),
      ),
  ),
  plannerGoogleCalendarDropLocal: storeUnit(
    (
      store,
      input: CalendarItemInput & { readonly remote: GoogleEvent | null; readonly baseEtag: string },
    ) =>
      scoped(store, input, (applier, ctx) => {
        applier.dropLocal(ctx, input.item, input.remote, input.baseEtag);
      }),
  ),
} as const;
