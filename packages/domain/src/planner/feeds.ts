import { z } from 'zod';
import { PLANNER_PUBLIC_TOKEN } from './tokens';

const MOMENT = z.iso.datetime({ offset: true });

export const PLANNER_FEED_KINDS = ['ics', 'holidays', 'birthdays'] as const;

export type PlannerFeedKind = (typeof PLANNER_FEED_KINDS)[number];

export const PLANNER_FEED_DEFAULT_REFRESH_MINUTES = 360;

export const PLANNER_FEED_URL = z.url({ protocol: /^(https?|webcal)$/ });

export const PLANNER_HOLIDAY_COUNTRY = z.string().regex(/^[A-Z]{2}$/, 'an ISO 3166-1 country code');

export const PLANNER_HOLIDAY_STATE = z.string().regex(/^[A-Za-z0-9-]+$/, 'a state or region code');

export const PLANNER_FEED_FAILURE = z
  .strictObject({ at: MOMENT, reason: z.string().min(1) })
  .readonly();

export type PlannerFeedFailure = z.infer<typeof PLANNER_FEED_FAILURE>;

export const PLANNER_ICS_FEED = z
  .strictObject({
    kind: z.literal('ics'),
    url: PLANNER_FEED_URL,
    refresh_minutes: z.int().positive(),
    etag: z.string().min(1).nullable(),
    last_modified: z.string().min(1).nullable(),
    fetched_at: MOMENT.nullable(),
    failure: PLANNER_FEED_FAILURE.nullable(),
  })
  .readonly();

export const PLANNER_HOLIDAYS_FEED = z
  .strictObject({
    kind: z.literal('holidays'),
    country: PLANNER_HOLIDAY_COUNTRY,
    state: PLANNER_HOLIDAY_STATE.nullable(),
  })
  .readonly();

export const PLANNER_BIRTHDAYS_FEED = z.strictObject({ kind: z.literal('birthdays') }).readonly();

export const PLANNER_FEED = z
  .discriminatedUnion('kind', [PLANNER_ICS_FEED, PLANNER_HOLIDAYS_FEED, PLANNER_BIRTHDAYS_FEED])
  .readonly();

export type PlannerFeed = z.infer<typeof PLANNER_FEED>;

export const PLANNER_HOLIDAY_REGION = z
  .strictObject({
    country: PLANNER_HOLIDAY_COUNTRY,
    name: z.string().min(1),
    states: z
      .array(z.strictObject({ code: PLANNER_HOLIDAY_STATE, name: z.string().min(1) }).readonly())
      .readonly(),
  })
  .readonly();

export type PlannerHolidayRegion = z.infer<typeof PLANNER_HOLIDAY_REGION>;

export const PLANNER_FEED_PATHS = { publishedFeed: '/cal/:file' } as const;

export const PLANNER_PUBLISHED_FEED_FILE = z
  .string()
  .regex(/^[A-Za-z0-9_-]{43}\.ics$/, 'a feed link token followed by .ics');

export const PLANNER_ICS_CONTENT_TYPE = 'text/calendar';

export const PLANNER_IMPORT_PARTS = [
  'timezone',
  'recurrence',
  'attachment',
  'alarm',
  'attendee',
  'component',
  'property',
] as const;

export const PLANNER_IMPORT_RESULT = z
  .strictObject({
    added: z.int().nonnegative(),
    updated: z.int().nonnegative(),
    unchanged: z.int().nonnegative(),
    unsupported: z
      .array(
        z
          .strictObject({
            part: z.enum(PLANNER_IMPORT_PARTS),
            detail: z.string().min(1),
            count: z.int().positive(),
          })
          .readonly(),
      )
      .readonly(),
  })
  .readonly();

export type PlannerImportResult = z.infer<typeof PLANNER_IMPORT_RESULT>;

export const PLANNER_EXPORT_REACH = ['public', 'home'] as const;

export const PLANNER_EXPORT_LINK = z
  .strictObject({
    collection_id: z.uuid(),
    token: PLANNER_PUBLIC_TOKEN,
    url: z.url(),
    reach: z.enum(PLANNER_EXPORT_REACH),
    created_at: MOMENT,
  })
  .readonly();

export type PlannerExportLink = z.infer<typeof PLANNER_EXPORT_LINK>;
