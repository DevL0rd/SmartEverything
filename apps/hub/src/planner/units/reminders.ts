import type {
  PlannerItemRow,
  PlannerMissedReason,
  PlannerOccurrenceView,
  PlannerRingRow,
} from '@smarteverything/domain';
import { storeUnit } from '../../store/host/unit';
import type { HostStore } from '../../store/host/host-store';
import { isoOf } from '../instants';
import { expandOccurrences } from '../occurrences';
import { loadWindow } from '../range';
import { duesOfView, reachOf, ringKey, type Due } from '../reminder-dues';

const DAY_MS = 86_400_000;

export interface PlainDue {
  readonly atMs: number;
  readonly kind: Due['kind'];
  readonly item: PlannerItemRow;
  readonly profileId: string;
  readonly view: PlannerOccurrenceView;
  readonly anchorMs: number;
  readonly minutesBefore: number;
}

export interface AnnouncedDue {
  readonly due: PlainDue;
  readonly ring: PlannerRingRow | null;
}

function plain(due: Due): PlainDue {
  return {
    atMs: due.at.epochMilliseconds,
    kind: due.kind,
    item: due.item,
    profileId: due.profileId,
    view: due.view,
    anchorMs: due.anchor.epochMilliseconds,
    minutesBefore: due.minutesBefore,
  };
}

function instant(milliseconds: number): Temporal.Instant {
  return Temporal.Instant.fromEpochMilliseconds(milliseconds);
}

function duesIn(
  store: HostStore,
  profileId: string,
  from: Temporal.Instant,
  to: Temporal.Instant,
): Due[] {
  const zone = store.settings.read().time_zone;
  const reach = reachOf(store.plannerItems.list(profileId, { scope: 'involved' }));
  const window = {
    from: from.subtract({ milliseconds: reach.lead }),
    to: to.add({ milliseconds: reach.reach }),
    timeZone: zone,
  };
  const loaded = loadWindow(store, profileId, window, 'involved');
  const items = new Map(loaded.items.map((item) => [item.id, item]));
  const views = expandOccurrences({
    items: loaded.items,
    stored: loaded.stored,
    window,
    now: from,
  });
  const seen = new Set<string>();
  return views
    .flatMap((view) => {
      const item = items.get(view.item_id);
      return item === undefined ? [] : duesOfView(view, item, profileId, zone);
    })
    .filter((due) => {
      const key = `${due.kind}|${due.view.occurrence_key}|${ringKey(due.item, due.at)}`;
      const inside =
        Temporal.Instant.compare(due.at, from) >= 0 && Temporal.Instant.compare(due.at, to) < 0;
      if (!inside || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Temporal.Instant.compare(a.at, b.at));
}

function nextDue(
  store: HostStore,
  { profileId, afterMs }: { readonly profileId: string; readonly afterMs: number },
): PlainDue | null {
  const reach = reachOf(store.plannerItems.list(profileId, { scope: 'involved' }));
  if (!reach.relevant) return null;
  const after = instant(afterMs);
  for (let span = DAY_MS; ; span *= 2) {
    const to = after.add({ milliseconds: span });
    const best = duesIn(store, profileId, after, to)[0];
    if (best !== undefined) return plain(best);
    if (reach.latest !== null && to.epochMilliseconds > reach.latest) return null;
  }
}

function rung(store: HostStore, due: PlainDue): boolean {
  const at = new Date(due.atMs).toISOString();
  return store.plannerRings
    .forRef('reminder', due.item.id)
    .some((row) => row.due_at === at && row.profile_id === due.profileId);
}

function ringDues(
  store: HostStore,
  {
    profileId,
    atMs,
    nowMs,
  }: { readonly profileId: string; readonly atMs: number; readonly nowMs: number },
): AnnouncedDue[] {
  const at = instant(atMs);
  const now = new Date(nowMs).toISOString();
  const announced: AnnouncedDue[] = [];
  for (const found of duesIn(store, profileId, at, at.add({ milliseconds: 1 }))) {
    const due = plain(found);
    if (due.kind === 'missed') {
      announced.push({ due, ring: null });
      continue;
    }
    if (rung(store, due)) continue;
    const ring = store.plannerRings.insert({
      kind: 'reminder',
      ref_id: due.item.id,
      profile_id: due.profileId,
      due_at: isoOf(found.at),
      rang_at: now,
      dismissed_at: now,
      snoozes: 0,
      target: null,
      outcome: 'rang',
      missed_reason: null,
    });
    announced.push({ due, ring });
  }
  return announced;
}

function handledUntil(store: HostStore, profileId: string): Map<string, number> {
  const lower = new Map<string, number>();
  for (const item of store.plannerItems.list(profileId, { scope: 'involved' })) {
    if (item.reminders.length === 0) continue;
    const rings = store.plannerRings
      .forRef('reminder', item.id)
      .filter((ring) => ring.profile_id === profileId);
    const latest = rings.at(-1)?.due_at;
    lower.set(
      item.id,
      Math.max(Date.parse(item.updated_at), latest === undefined ? 0 : Date.parse(latest)),
    );
  }
  return lower;
}

function settleOverdue(
  store: HostStore,
  profileId: string,
  now: Temporal.Instant,
  reason: PlannerMissedReason,
): PlannerRingRow[] {
  const lower = handledUntil(store, profileId);
  if (lower.size === 0) return [];
  const from = instant(Math.min(...lower.values()));
  const overdue = duesIn(store, profileId, from, now.add({ milliseconds: 1 })).filter(
    (due) =>
      due.kind === 'reminder' &&
      due.at.epochMilliseconds > (lower.get(due.item.id) ?? Infinity) &&
      !rung(store, plain(due)),
  );
  return overdue.map((due) =>
    store.plannerRings.insert({
      kind: 'reminder',
      ref_id: due.item.id,
      profile_id: due.profileId,
      due_at: isoOf(due.at),
      rang_at: null,
      dismissed_at: null,
      snoozes: 0,
      target: null,
      outcome: 'missed',
      missed_reason: reason,
    }),
  );
}

export interface OverdueReminders {
  readonly profiles: readonly string[];
  readonly missed: readonly PlannerRingRow[];
}

function overdueReminders(
  store: HostStore,
  { nowMs, reason }: { readonly nowMs: number; readonly reason: PlannerMissedReason },
): OverdueReminders {
  const now = instant(nowMs);
  const profiles = store.profiles.list().map((profile) => profile.id);
  return {
    profiles,
    missed: profiles.flatMap((profileId) => settleOverdue(store, profileId, now, reason)),
  };
}

export const PLANNER_REMINDER_READ_UNITS = {
  plannerReminderNext: storeUnit(nextDue),
  plannerReminderDues: storeUnit(
    (store, { profileId, atMs }: { readonly profileId: string; readonly atMs: number }) =>
      duesIn(store, profileId, instant(atMs), instant(atMs + 1)).map(plain),
  ),
} as const;

export const PLANNER_REMINDER_WRITE_UNITS = {
  plannerReminderRing: storeUnit(ringDues),
  plannerRemindersOverdue: storeUnit(overdueReminders),
} as const;
