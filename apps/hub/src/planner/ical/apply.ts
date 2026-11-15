import { PLANNER_OCCURRENCE_SINGLE, type PlannerItemRow } from '@smarteverything/domain';
import type { PlannerItemPatch } from '../../store/repositories/planner-items';
import type { Store } from '../../store/store';
import type { IcalEntry } from './model';
import { itemIdOfLocalUid, plannedItemOf, type PlannedItem } from './map-item';
import { projectionOf } from './projection';
import { syncGuests } from './sync-guests';

export type ApplyStore = Pick<
  Store,
  'write' | 'plannerItems' | 'plannerGuests' | 'plannerOccurrences'
>;

export interface ApplyRequest {
  readonly profileId: string;
  readonly collectionId: string;
  readonly createdBy: 'person' | 'feed';
  readonly removeMissing: boolean;
}

export interface ApplyTally {
  readonly added: number;
  readonly updated: number;
  readonly unchanged: number;
  readonly removed: number;
}

function patchOf(planned: PlannedItem): PlannerItemPatch {
  const { master } = planned;
  return {
    title: master.title,
    notes: master.notes,
    location: master.location,
    priority: master.priority,
    start_local: master.start_local,
    end_local: master.end_local,
    time_zone: master.time_zone,
    all_day: master.all_day,
    due_date: master.due_date,
    due_at: master.due_at,
    rrule: master.rrule,
    exdates: master.exdates,
    start: master.start,
    end: master.end,
    series_end: master.series_end,
    status: master.status,
    reminders: master.reminders,
    ical_uid: master.ical_uid,
    ical_sequence: master.ical_sequence,
  };
}

export class ApplyRun {
  private added = 0;
  private updated = 0;
  private unchanged = 0;
  private removed = 0;
  private position: number;
  private readonly ids = new Map<string, string>();

  constructor(
    private readonly store: ApplyStore,
    private readonly request: ApplyRequest,
    private readonly now: () => Date,
  ) {
    this.position = nextPosition(store, request.collectionId);
  }

  apply(entries: readonly IcalEntry[]): ApplyTally {
    const base = {
      profileId: this.request.profileId,
      collectionId: this.request.collectionId,
      createdBy: this.request.createdBy,
    };
    const ordered = [
      ...entries.filter((entry) => entry.parentUid === null),
      ...entries.filter((entry) => entry.parentUid !== null),
    ];
    const seen = new Set<string>();
    for (const entry of ordered) {
      const id = this.applyOne(
        entry.uid,
        plannedItemOf(entry, { ...base, position: this.position }),
      );
      this.ids.set(entry.uid, id);
      seen.add(id);
    }
    if (this.request.removeMissing) this.dropMissing(seen);
    return {
      added: this.added,
      updated: this.updated,
      unchanged: this.unchanged,
      removed: this.removed,
    };
  }

  private lookup(uid: string): PlannerItemRow | undefined {
    const { plannerItems } = this.store;
    const own = plannerItems.byIcalUid(this.request.collectionId, uid);
    if (own !== undefined) return own;
    const id = itemIdOfLocalUid(uid);
    const local = id === null ? undefined : plannerItems.findAny(id);
    return local?.collection_id === this.request.collectionId ? local : undefined;
  }

  private replaceOverrides(master: PlannerItemRow, planned: PlannedItem): void {
    const { plannerItems } = this.store;
    for (const stale of plannerItems.overrides(master.id, master.profile_id)) {
      plannerItems.purge(stale.id, master.profile_id);
    }
    for (const override of planned.overrides) {
      plannerItems.insert({ ...override, profile_id: master.profile_id, series_id: master.id });
    }
  }

  private recordDone(item: PlannerItemRow, planned: PlannedItem): void {
    if (planned.master.status !== 'done' || planned.master.rrule !== null) return;
    this.store.plannerOccurrences.save({
      item_id: item.id,
      occurrence_key: PLANNER_OCCURRENCE_SINGLE,
      status: 'done',
      completed_at: planned.completedAt ?? this.now().toISOString(),
      completed_by: 'person',
      evidence: null,
      moved_start: null,
      moved_end: null,
    });
  }

  private parentOf(planned: PlannedItem): string | null {
    if (planned.parentUid === null) return null;
    return this.ids.get(planned.parentUid) ?? this.lookup(planned.parentUid)?.id ?? null;
  }

  private settle(item: PlannerItemRow, planned: PlannedItem): PlannerItemRow {
    this.replaceOverrides(item, planned);
    syncGuests(this.store, item.id, planned.guests, this.now());
    this.recordDone(item, planned);
    return item;
  }

  private insertItem(planned: PlannedItem): PlannerItemRow {
    const item = this.store.plannerItems.insert({
      ...planned.master,
      parent_id: this.parentOf(planned),
      position: this.position,
    });
    this.position += 1;
    return this.settle(item, planned);
  }

  private updateItem(existing: PlannerItemRow, planned: PlannedItem): PlannerItemRow {
    const item = this.store.plannerItems.update(existing.id, existing.profile_id, {
      ...patchOf(planned),
      parent_id: this.parentOf(planned),
    });
    return this.settle(item, planned);
  }

  private sameAs(existing: PlannerItemRow, planned: PlannedItem): boolean {
    const { plannerItems, plannerGuests } = this.store;
    const overrides = plannerItems.overrides(existing.id, existing.profile_id);
    const guests = plannerGuests.forItem(existing.id).filter((guest) => guest.email !== null);
    return (
      projectionOf(planned.master, planned.overrides, planned.guests) ===
      projectionOf(existing, overrides, guests)
    );
  }

  private applyOne(uid: string, planned: PlannedItem): string {
    const existing = this.lookup(uid);
    if (existing === undefined) {
      this.added += 1;
      return this.insertItem(planned).id;
    }
    if (existing.deleted_at !== null) {
      this.store.plannerItems.purge(existing.id, existing.profile_id);
      this.added += 1;
      return this.insertItem(planned).id;
    }
    if (existing.ical_sequence > planned.master.ical_sequence || this.sameAs(existing, planned)) {
      this.unchanged += 1;
      return existing.id;
    }
    this.updated += 1;
    return this.updateItem(existing, planned).id;
  }

  private dropMissing(seen: ReadonlySet<string>): void {
    const { plannerItems } = this.store;
    for (const row of plannerItems.inCollection(this.request.collectionId)) {
      if (row.series_id !== null || row.ical_uid === null || seen.has(row.id)) continue;
      if (plannerItems.findAny(row.id) === undefined) continue;
      plannerItems.purge(row.id, row.profile_id);
      this.removed += 1;
    }
  }
}

function nextPosition(store: ApplyStore, collectionId: string): number {
  return store.plannerItems
    .inCollection(collectionId)
    .reduce((highest, row) => Math.max(highest, row.position + 1), 0);
}

export function applyEntries(
  store: ApplyStore,
  now: () => Date,
  request: ApplyRequest,
  entries: readonly IcalEntry[],
): ApplyTally {
  return store.write(() => new ApplyRun(store, request, now).apply(entries));
}
