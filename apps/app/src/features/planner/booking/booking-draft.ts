import type {
  API_ENDPOINTS as E,
  PlannerBookingPageRow,
  PlannerBookingWindow,
} from '@smarteverything/domain';
import type { z } from 'zod';

type CreateBody = z.input<(typeof E)['createPlannerBookingPage']['body']>;
type ChangeBody = z.input<(typeof E)['updatePlannerBookingPage']['body']>;

export interface BookingDraft {
  readonly title: string;
  readonly description: string;
  readonly minutes: number;
  readonly availability: readonly PlannerBookingWindow[];
  readonly buffer_before: number;
  readonly buffer_after: number;
  readonly notice_minutes: number;
  readonly ahead_days: number;
  readonly location: string;
  readonly collection_id: string | null;
}

export interface DraftDefaults {
  readonly availability: readonly PlannerBookingWindow[];
  readonly collectionId: string | null;
}

export const NEW_PAGE_MINUTES = 30;

export const NEW_PAGE_NOTICE_MINUTES = 4 * 60;

export const NEW_PAGE_AHEAD_DAYS = 30;

export function draftOf(page: PlannerBookingPageRow | null, defaults: DraftDefaults): BookingDraft {
  if (page === null) {
    return {
      title: '',
      description: '',
      minutes: NEW_PAGE_MINUTES,
      availability: defaults.availability,
      buffer_before: 0,
      buffer_after: 0,
      notice_minutes: NEW_PAGE_NOTICE_MINUTES,
      ahead_days: NEW_PAGE_AHEAD_DAYS,
      location: '',
      collection_id: defaults.collectionId,
    };
  }
  return {
    title: page.title,
    description: page.description,
    minutes: page.minutes,
    availability: page.availability,
    buffer_before: page.buffer_before,
    buffer_after: page.buffer_after,
    notice_minutes: page.notice_minutes,
    ahead_days: page.ahead_days,
    location: page.location ?? '',
    collection_id: page.collection_id,
  };
}

export type DraftProblem = 'title' | 'calendar';

export function draftProblemOf(draft: BookingDraft): DraftProblem | null {
  if (draft.title.trim() === '') return 'title';
  return draft.collection_id === null ? 'calendar' : null;
}

function locationOf(draft: BookingDraft): string | null {
  const location = draft.location.trim();
  return location === '' ? null : location;
}

export function createBodyOf(draft: BookingDraft): CreateBody | null {
  if (draftProblemOf(draft) !== null || draft.collection_id === null) return null;
  return {
    collection_id: draft.collection_id,
    title: draft.title.trim(),
    description: draft.description.trim(),
    minutes: draft.minutes,
    availability: [...draft.availability],
    buffer_before: draft.buffer_before,
    buffer_after: draft.buffer_after,
    notice_minutes: draft.notice_minutes,
    ahead_days: draft.ahead_days,
    location: locationOf(draft),
    enabled: true,
  };
}

function sameWindows(
  left: readonly PlannerBookingWindow[],
  right: readonly PlannerBookingWindow[],
): boolean {
  return (
    left.length === right.length &&
    left.every((window, index) => {
      const other = right[index];
      return other?.day === window.day && other.start === window.start && other.end === window.end;
    })
  );
}

function scalarChangesOf(page: PlannerBookingPageRow, body: CreateBody): ChangeBody {
  const changed = <T>(next: T, now: T): boolean => next !== now;
  return {
    ...(changed(body.collection_id, page.collection_id)
      ? { collection_id: body.collection_id }
      : {}),
    ...(changed(body.title, page.title) ? { title: body.title } : {}),
    ...(changed(body.description, page.description) ? { description: body.description } : {}),
    ...(changed(body.minutes, page.minutes) ? { minutes: body.minutes } : {}),
    ...(changed(body.buffer_before, page.buffer_before)
      ? { buffer_before: body.buffer_before }
      : {}),
    ...(changed(body.buffer_after, page.buffer_after) ? { buffer_after: body.buffer_after } : {}),
    ...(changed(body.notice_minutes, page.notice_minutes)
      ? { notice_minutes: body.notice_minutes }
      : {}),
    ...(changed(body.ahead_days, page.ahead_days) ? { ahead_days: body.ahead_days } : {}),
    ...(changed(body.location, page.location) ? { location: body.location } : {}),
  };
}

export function changesOf(page: PlannerBookingPageRow, draft: BookingDraft): ChangeBody | null {
  const body = createBodyOf(draft);
  if (body === null) return null;
  const changes: ChangeBody = {
    ...scalarChangesOf(page, body),
    ...(sameWindows(page.availability, draft.availability)
      ? {}
      : { availability: body.availability }),
  };
  return Object.keys(changes).length === 0 ? null : changes;
}
