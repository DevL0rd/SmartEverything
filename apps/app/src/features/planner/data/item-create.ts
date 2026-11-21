import {
  parsePlannerRrule,
  type API_ENDPOINTS as E,
  type PlannerItemRow,
} from '@smarteverything/domain';
import type { z } from 'zod';
import { zonedInstant } from '../../../format/time';
import type { StoreState } from '../../../store/state';

export type ItemCreate = z.output<(typeof E)['createPlannerItem']['body']>;

const LOCAL_CLOCK = /T(\d{2}):(\d{2})(?::(\d{2}(?:\.\d+)?))?$/u;

export function instantOfLocal(local: string, zone: string | null): string {
  const day = local.slice(0, 10);
  if (zone === null) return new Date(`${day}T00:00:00.000Z`).toISOString();
  const clock = LOCAL_CLOCK.exec(local);
  if (clock === null) return new Date(zonedInstant(day, 0, zone)).toISOString();
  const minuteOfDay = Number(clock[1]) * 60 + Number(clock[2]);
  const seconds = clock[3] === undefined ? 0 : Number(clock[3]);
  return new Date(zonedInstant(day, minuteOfDay, zone) + seconds * 1000).toISOString();
}

function ownerOf(state: StoreState, body: ItemCreate): string | null {
  const { planner_items: items, planner_collections: collections } = state.tables;
  if (body.parent_id !== null) return items.byId[body.parent_id]?.profile_id ?? null;
  return collections.byId[body.collection_id]?.profile_id ?? null;
}

function nextPosition(state: StoreState, ownerId: string, collectionId: string): number {
  return state.tables.planner_items.rows.reduce(
    (highest, row) =>
      row.profile_id === ownerId && row.collection_id === collectionId
        ? Math.max(highest, row.position + 1)
        : highest,
    0,
  );
}

const DAY_MS = 86_400_000;

function untilInstant(body: ItemCreate, length: number): string | null {
  if (body.rrule === null) return null;
  const rule = parsePlannerRrule(body.rrule);
  if (!rule.success || rule.data.until === null) return null;
  const { until } = rule.data;
  const at =
    until.kind === 'date'
      ? Date.parse(instantOfLocal(until.value, null)) + DAY_MS
      : Date.parse(until.utc ? `${until.value}Z` : instantOfLocal(until.value, body.time_zone));
  return new Date(at + length).toISOString();
}

function seriesEndOf(body: ItemCreate, start: string | null, end: string | null): string | null {
  if (start === null) return null;
  return untilInstant(body, end === null ? 0 : Date.parse(end) - Date.parse(start));
}

export function predictedItem(
  state: StoreState,
  body: ItemCreate,
  at: Date,
): PlannerItemRow | null {
  const { id, ...fields } = body;
  const ownerId = ownerOf(state, body);
  if (id === undefined || ownerId === null) return null;
  const now = at.toISOString();
  const start = body.start_local === null ? null : instantOfLocal(body.start_local, body.time_zone);
  const end = body.end_local === null ? null : instantOfLocal(body.end_local, body.time_zone);
  return {
    ...fields,
    id,
    profile_id: ownerId,
    position: body.position ?? nextPosition(state, ownerId, body.collection_id),
    series_id: null,
    original_start: null,
    start,
    end,
    series_end: seriesEndOf(body, start, end),
    status: 'open',
    google: null,
    ical_uid: null,
    ical_sequence: 0,
    booking_page_id: null,
    created_by: 'person',
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
}
