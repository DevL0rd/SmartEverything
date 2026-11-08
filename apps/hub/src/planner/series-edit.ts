import {
  ApiError,
  PLANNER_LOCAL_DATE,
  PLANNER_OCCURRENCE_SINGLE,
  parsePlannerRrule,
  type PlannerItemRow,
  type PlannerItemScope,
} from '@smarteverything/domain';
import type { PLANNER_ITEM_CHANGES } from '@smarteverything/domain';
import type { z } from 'zod';
import type { PlannerItemInput } from '../store/repositories/planner-items';
import type { Store } from '../store/store';
import { instantOf, instantsOf, isoOf } from './instants';
import { occurrencesBetween, type RecurrenceSeries } from './recurrence';

export type SeriesStore = Pick<Store, 'plannerItems' | 'plannerOccurrences'>;

export type PlannerItemChanges = z.infer<typeof PLANNER_ITEM_CHANGES>;

export interface SeriesEdit {
  readonly scope: PlannerItemScope;
  readonly occurrence_key?: string | undefined;
  readonly changes: PlannerItemChanges;
}

export interface SeriesRemoval {
  readonly scope: PlannerItemScope;
  readonly occurrence_key?: string | undefined;
}

interface Slot {
  readonly local: string;
  readonly key: string;
  readonly instant: Temporal.Instant;
}

interface Target {
  readonly profileId: string;
  readonly master: PlannerItemRow;
  readonly slot: Slot;
}

const MILLISECOND = { milliseconds: 1 } as const;
const RULE_END = /(?:^|;)(?:COUNT|UNTIL)=[^;]*/g;

function refuse(message: string): ApiError {
  return new ApiError('invalid_request', message);
}

function whole(value: string): string {
  return value.length === 16 ? `${value}:00` : value;
}

function sameLocal(a: string, b: string): boolean {
  return whole(a) === whole(b);
}

function withPatch<T extends object, P extends object>(base: T, patch: P): T {
  return Object.assign({}, base, patch);
}

function seriesOf(master: PlannerItemRow, exdates: readonly string[]): RecurrenceSeries {
  if (master.start_local === null || master.rrule === null) {
    throw refuse('This item does not repeat.');
  }
  return {
    start: master.start_local,
    timeZone: master.time_zone,
    rrule: master.rrule,
    exdates,
  };
}

function slotOf(master: PlannerItemRow, key: string): Slot {
  if (key === PLANNER_OCCURRENCE_SINGLE)
    throw refuse('A repeating item needs the occurrence it means.');
  if (PLANNER_LOCAL_DATE.safeParse(key).success !== master.all_day) {
    throw refuse('The occurrence is a date for an all-day item and a moment otherwise.');
  }
  const instant = master.all_day ? instantOf(key, null) : Temporal.Instant.from(key);
  const found = occurrencesBetween(
    seriesOf(master, master.exdates),
    instant,
    instant.add(MILLISECOND),
  ).at(0);
  if (found === undefined) throw refuse('That moment is not an occurrence of this series.');
  return { local: found.local, key, instant };
}

function overrideKey(master: PlannerItemRow, override: PlannerItemRow): string {
  if (override.original_start === null) throw refuse('This item is not part of a series.');
  return master.all_day
    ? override.original_start
    : isoOf(instantOf(override.original_start, master.time_zone));
}

function targetOf(
  store: SeriesStore,
  profileId: string,
  item: PlannerItemRow,
  key: string | undefined,
): Target {
  if (item.series_id === null) {
    return { profileId, master: item, slot: slotOf(item, key ?? PLANNER_OCCURRENCE_SINGLE) };
  }
  const master = store.plannerItems.byId(item.series_id, profileId);
  return { profileId, master, slot: slotOf(master, overrideKey(master, item)) };
}

function endAfter(
  source: Pick<PlannerItemRow, 'start_local' | 'end_local' | 'all_day' | 'time_zone'>,
  start: string,
  zone: string | null,
): string | null {
  if (source.start_local === null || source.end_local === null) return null;
  if (source.all_day) {
    const days = Temporal.PlainDate.from(source.start_local).until(
      Temporal.PlainDate.from(source.end_local),
      { largestUnit: 'days' },
    ).days;
    return Temporal.PlainDate.from(start).add({ days }).toString();
  }
  const length =
    instantOf(source.end_local, source.time_zone).epochMilliseconds -
    instantOf(source.start_local, source.time_zone).epochMilliseconds;
  return instantOf(start, zone)
    .add({ milliseconds: length })
    .toZonedDateTimeISO(zone ?? 'UTC')
    .toPlainDateTime()
    .toString({ smallestUnit: 'second' });
}

function withEnd(source: PlannerItemRow, changes: PlannerItemChanges): PlannerItemChanges {
  if (
    changes.start_local === undefined ||
    changes.start_local === null ||
    changes.end_local !== undefined
  ) {
    return changes;
  }
  const zone = changes.time_zone === undefined ? source.time_zone : changes.time_zone;
  return { ...changes, end_local: endAfter(source, changes.start_local, zone) };
}

function patchItem(
  store: SeriesStore,
  profileId: string,
  before: PlannerItemRow,
  changes: PlannerItemChanges,
): PlannerItemRow {
  return store.plannerItems.update(before.id, profileId, {
    ...changes,
    ...instantsOf(withPatch(before, changes)),
  });
}

export function removeItem(store: SeriesStore, profileId: string, item: PlannerItemRow): void {
  if (item.google === null) {
    store.plannerItems.purge(item.id, profileId);
    return;
  }
  for (const override of store.plannerItems.overrides(item.id, profileId)) {
    store.plannerItems.trash(override.id, profileId);
  }
  store.plannerItems.trash(item.id, profileId);
}

function overrideAt(store: SeriesStore, target: Target): PlannerItemRow | undefined {
  return store.plannerItems
    .overrides(target.master.id, target.profileId)
    .find(
      (override) =>
        override.original_start !== null && sameLocal(override.original_start, target.slot.local),
    );
}

function overrideRow(
  master: PlannerItemRow,
  slot: Slot,
  changes: PlannerItemChanges,
): PlannerItemInput {
  const carried: PlannerItemInput = master;
  const seeded: PlannerItemInput = {
    ...carried,
    start_local: slot.local,
    end_local: endAfter(master, slot.local, master.time_zone),
    rrule: null,
    exdates: [],
    series_id: master.id,
    original_start: slot.local,
    due_date: null,
    due_at: null,
    status: 'open',
    google: null,
    created_by: 'person',
  };
  const merged: PlannerItemInput = withPatch(seeded, withEnd({ ...master, ...seeded }, changes));
  return { ...merged, ...instantsOf(merged) };
}

function carryOccurrence(store: SeriesStore, target: Target, override: PlannerItemRow): void {
  const row = store.plannerOccurrences.find(target.master.id, target.slot.key);
  if (row === undefined) return;
  store.plannerOccurrences.save({
    ...row,
    item_id: override.id,
    occurrence_key: PLANNER_OCCURRENCE_SINGLE,
  });
  store.plannerOccurrences.remove(target.master.id, target.slot.key);
}

function editThis(store: SeriesStore, target: Target, changes: PlannerItemChanges): PlannerItemRow {
  const existing = overrideAt(store, target);
  if (existing !== undefined) {
    return patchItem(store, target.profileId, existing, withEnd(existing, changes));
  }
  const created = store.plannerItems.insert(overrideRow(target.master, target.slot, changes));
  carryOccurrence(store, target, created);
  return created;
}

function ruleWithoutEnd(rrule: string): string {
  return rrule.replace(RULE_END, '').replace(/^;/, '');
}

function untilText(master: PlannerItemRow, slot: Slot): string {
  if (master.all_day) {
    return Temporal.PlainDate.from(slot.local).subtract({ days: 1 }).toString().replaceAll('-', '');
  }
  return slot.instant
    .subtract({ seconds: 1 })
    .toString({ smallestUnit: 'second' })
    .replaceAll('-', '')
    .replaceAll(':', '');
}

function endedRule(master: PlannerItemRow, slot: Slot): string {
  return `${ruleWithoutEnd(seriesOf(master, []).rrule)};UNTIL=${untilText(master, slot)}`;
}

function remainingRule(master: PlannerItemRow, slot: Slot): string {
  const series = seriesOf(master, []);
  const parsed = parsePlannerRrule(series.rrule);
  if (!parsed.success || parsed.data.count === null) return series.rrule;
  const startInstant = instantOf(series.start, master.time_zone);
  const before = occurrencesBetween(series, startInstant, slot.instant).length;
  return `${ruleWithoutEnd(series.rrule)};COUNT=${String(parsed.data.count - before)}`;
}

function startsAtOrAfter(master: PlannerItemRow, slot: Slot, key: string): boolean {
  if (key === PLANNER_OCCURRENCE_SINGLE) return false;
  if (master.all_day) return key >= slot.key;
  return Temporal.Instant.compare(Temporal.Instant.from(key), slot.instant) >= 0;
}

function moveTail(store: SeriesStore, target: Target, to: PlannerItemRow | null): void {
  const { master, slot, profileId } = target;
  const overrides = store.plannerItems
    .overrides(master.id, profileId)
    .filter(
      (override) =>
        override.original_start !== null && whole(override.original_start) >= whole(slot.local),
    );
  for (const override of overrides) {
    if (to === null) removeItem(store, profileId, override);
    else store.plannerItems.update(override.id, profileId, { series_id: to.id });
  }
  const rows = store.plannerOccurrences
    .forItems([master.id])
    .filter((row) => startsAtOrAfter(master, slot, row.occurrence_key));
  for (const row of rows) {
    if (to !== null) store.plannerOccurrences.save({ ...row, item_id: to.id });
    store.plannerOccurrences.remove(master.id, row.occurrence_key);
  }
}

function keysChange(master: PlannerItemRow, slot: Slot, changes: PlannerItemChanges): boolean {
  const moved =
    changes.start_local !== undefined &&
    changes.start_local !== null &&
    !sameLocal(changes.start_local, slot.local);
  const rule = changes.rrule !== undefined && changes.rrule !== master.rrule;
  const zone = changes.time_zone !== undefined && changes.time_zone !== master.time_zone;
  const day = changes.all_day !== undefined && changes.all_day !== master.all_day;
  return moved || rule || zone || day;
}

function tailRow(
  master: PlannerItemRow,
  slot: Slot,
  changes: PlannerItemChanges,
): PlannerItemInput {
  const rrule = changes.rrule === undefined ? remainingRule(master, slot) : changes.rrule;
  const carried: PlannerItemInput = master;
  const seeded: PlannerItemInput = {
    ...carried,
    start_local: slot.local,
    end_local: endAfter(master, slot.local, master.time_zone),
    rrule,
    exdates:
      rrule === null ? [] : master.exdates.filter((value) => whole(value) >= whole(slot.local)),
    series_id: null,
    original_start: null,
    status: 'open',
    google: null,
  };
  const merged: PlannerItemInput = withPatch(seeded, withEnd({ ...master, ...seeded }, changes));
  return { ...merged, ...instantsOf(merged) };
}

function endMaster(store: SeriesStore, target: Target): void {
  const { master, slot, profileId } = target;
  patchItem(store, profileId, master, {
    rrule: endedRule(master, slot),
    exdates: master.exdates.filter((value) => whole(value) < whole(slot.local)),
  });
}

function startsSeries(target: Target): boolean {
  const start = target.master.start_local;
  return start !== null && sameLocal(start, target.slot.local);
}

function editFollowing(
  store: SeriesStore,
  target: Target,
  changes: PlannerItemChanges,
): PlannerItemRow {
  const { master, slot, profileId } = target;
  if (startsSeries(target)) return patchItem(store, profileId, master, changes);
  const created = store.plannerItems.insert(tailRow(master, slot, changes));
  moveTail(store, target, keysChange(master, slot, changes) ? null : created);
  endMaster(store, target);
  return created;
}

function deleteThis(store: SeriesStore, target: Target): void {
  const { master, slot, profileId } = target;
  const existing = overrideAt(store, target);
  if (existing !== undefined) removeItem(store, profileId, existing);
  if (store.plannerOccurrences.find(master.id, slot.key) !== undefined) {
    store.plannerOccurrences.remove(master.id, slot.key);
  }
  if (master.exdates.some((value) => sameLocal(value, slot.local))) return;
  patchItem(store, profileId, master, { exdates: [...master.exdates, slot.local] });
}

function deleteFollowing(store: SeriesStore, target: Target): void {
  if (startsSeries(target)) {
    removeItem(store, target.profileId, target.master);
    return;
  }
  moveTail(store, target, null);
  endMaster(store, target);
}

export function editItem(
  store: SeriesStore,
  profileId: string,
  item: PlannerItemRow,
  edit: SeriesEdit,
): PlannerItemRow {
  if (edit.scope === 'all') return patchItem(store, profileId, item, edit.changes);
  const target = targetOf(store, profileId, item, edit.occurrence_key);
  return edit.scope === 'this'
    ? editThis(store, target, edit.changes)
    : editFollowing(store, target, edit.changes);
}

export function deleteItem(
  store: SeriesStore,
  profileId: string,
  item: PlannerItemRow,
  removal: SeriesRemoval,
): void {
  const alone = removal.scope === 'all' && item.series_id === null;
  if (alone) {
    removeItem(store, profileId, item);
    return;
  }
  const target = targetOf(store, profileId, item, removal.occurrence_key);
  if (removal.scope === 'following') deleteFollowing(store, target);
  else deleteThis(store, target);
}
