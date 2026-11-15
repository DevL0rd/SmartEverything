import { z } from 'zod';
import { TIME_ZONE } from '../automations';
import { CLOCK_TIME } from '../zoned-clock';
import { PLANNER_WEEKDAY } from './alarms';
import { PLANNER_PUBLIC_TOKEN } from './tokens';

const ID = z.uuid();
const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_BOOKING_WINDOW = z
  .strictObject({ day: PLANNER_WEEKDAY, start: CLOCK_TIME, end: CLOCK_TIME })
  .refine((window) => window.start < window.end, {
    path: ['end'],
    message: 'a window ends after it starts',
  })
  .readonly();

export type PlannerBookingWindow = z.infer<typeof PLANNER_BOOKING_WINDOW>;

export const PLANNER_BOOKING_AVAILABILITY = z
  .array(PLANNER_BOOKING_WINDOW)
  .refine(
    (windows) =>
      windows.every((window, index) =>
        windows.every(
          (other, at) =>
            at <= index ||
            window.day !== other.day ||
            window.end <= other.start ||
            other.end <= window.start,
        ),
      ),
    { message: 'windows on one day must not overlap' },
  )
  .readonly();

const PAGE_FIELDS = {
  collection_id: ID,
  title: z.string().trim().min(1),
  description: z.string(),
  minutes: z.int().positive(),
  availability: PLANNER_BOOKING_AVAILABILITY,
  buffer_before: z.int().nonnegative(),
  buffer_after: z.int().nonnegative(),
  notice_minutes: z.int().nonnegative(),
  ahead_days: z.int().positive(),
  location: z.string().trim().min(1).nullable(),
  enabled: z.boolean(),
} as const;

export const PLANNER_BOOKING_PAGE_ROW = z
  .strictObject({
    id: ID,
    profile_id: ID,
    ...PAGE_FIELDS,
    token: PLANNER_PUBLIC_TOKEN,
    created_at: MOMENT,
    updated_at: MOMENT,
  })
  .readonly();

export type PlannerBookingPageRow = z.infer<typeof PLANNER_BOOKING_PAGE_ROW>;

export const PLANNER_BOOKING_PAGE_CREATE = z.strictObject({
  collection_id: PAGE_FIELDS.collection_id,
  title: PAGE_FIELDS.title,
  description: PAGE_FIELDS.description.default(''),
  minutes: PAGE_FIELDS.minutes,
  availability: PAGE_FIELDS.availability,
  buffer_before: PAGE_FIELDS.buffer_before.default(0),
  buffer_after: PAGE_FIELDS.buffer_after.default(0),
  notice_minutes: PAGE_FIELDS.notice_minutes,
  ahead_days: PAGE_FIELDS.ahead_days,
  location: PAGE_FIELDS.location.default(null),
  enabled: PAGE_FIELDS.enabled.default(true),
});

export const PLANNER_BOOKING_PAGE_CHANGES = z
  .strictObject(PAGE_FIELDS)
  .partial()
  .refine((changes) => Object.keys(changes).length > 0, {
    message: 'name at least one field to change',
  });

export const PLANNER_BOOKING_PATHS = {
  page: '/book/:token',
  slots: '/book/:token/slots',
  book: '/book/:token',
} as const;

export const PLANNER_BOOKING_SLOTS_QUERY = z
  .strictObject({ from: MOMENT, to: MOMENT, time_zone: TIME_ZONE })
  .refine((query) => Date.parse(query.from) < Date.parse(query.to), {
    path: ['to'],
    message: 'the window ends after it starts',
  });

export const PLANNER_BOOKING_SLOT = z
  .strictObject({ start: MOMENT, end: MOMENT })
  .refine((slot) => Date.parse(slot.start) < Date.parse(slot.end), {
    path: ['end'],
    message: 'a slot ends after it starts',
  })
  .readonly();

export const PLANNER_BOOKING_PAGE_VIEW = z
  .strictObject({
    title: z.string().min(1),
    description: z.string(),
    minutes: z.int().positive(),
    location: z.string().min(1).nullable(),
    host: z.string().min(1),
    host_time_zone: TIME_ZONE,
    ahead_days: z.int().positive(),
  })
  .readonly();

export type PlannerBookingPageView = z.infer<typeof PLANNER_BOOKING_PAGE_VIEW>;

export const PLANNER_BOOKING_SLOTS = z
  .strictObject({
    page: PLANNER_BOOKING_PAGE_VIEW,
    slots: z.array(PLANNER_BOOKING_SLOT).readonly(),
  })
  .readonly();

export type PlannerBookingSlots = z.infer<typeof PLANNER_BOOKING_SLOTS>;

export const PLANNER_BOOKING_REQUEST = z.strictObject({
  name: z.string().trim().min(1),
  email: z.email(),
  note: z.string().default(''),
  start: MOMENT,
  time_zone: TIME_ZONE,
});

export type PlannerBookingRequest = z.infer<typeof PLANNER_BOOKING_REQUEST>;

export const PLANNER_BOOKING_CONFIRMATION = z
  .strictObject({
    title: z.string().min(1),
    start: MOMENT,
    end: MOMENT,
    location: z.string().min(1).nullable(),
    cancel_path: z.string().min(1),
  })
  .readonly();

export type PlannerBookingConfirmation = z.infer<typeof PLANNER_BOOKING_CONFIRMATION>;
