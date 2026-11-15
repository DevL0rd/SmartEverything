import { z } from 'zod';
import { PLANNER_COLLECTION_ROW, PLANNER_COLOUR } from '../planner/collections';
import {
  PLANNER_EXPORT_LINK,
  PLANNER_FEED_DEFAULT_REFRESH_MINUTES,
  PLANNER_FEED_URL,
  PLANNER_HOLIDAY_COUNTRY,
  PLANNER_HOLIDAY_REGION,
  PLANNER_HOLIDAY_STATE,
  PLANNER_IMPORT_RESULT,
} from '../planner/feeds';
import { NO_BODY, endpoint } from './endpoint';
import { PLANNER_PERSON_QUERY } from './endpoints-planner-items';
import { DONE, ID, NOTHING, somethingToChange } from './primitives';

const COLLECTION_PARAMS = z.strictObject({ collectionId: ID });

const ITEM_PARAMS = z.strictObject({ itemId: ID });

const RAW_CALENDAR = z
  .string()
  .describe('The iCalendar file text, sent with the content type text/calendar and never as JSON');

const FEED_NAMING = {
  name: z.string().trim().min(1).optional(),
  colour: PLANNER_COLOUR.optional(),
} as const;

export const PLANNER_FEED_CREATE = z.discriminatedUnion('kind', [
  z.strictObject({
    kind: z.literal('ics'),
    url: PLANNER_FEED_URL,
    refresh_minutes: z.int().positive().default(PLANNER_FEED_DEFAULT_REFRESH_MINUTES),
    ...FEED_NAMING,
  }),
  z.strictObject({
    kind: z.literal('holidays'),
    country: PLANNER_HOLIDAY_COUNTRY,
    state: PLANNER_HOLIDAY_STATE.nullable().default(null),
    ...FEED_NAMING,
  }),
  z.strictObject({ kind: z.literal('birthdays'), ...FEED_NAMING }),
]);

export type PlannerFeedCreate = z.infer<typeof PLANNER_FEED_CREATE>;

export const PLANNER_FEED_CHANGES = somethingToChange({
  url: PLANNER_FEED_URL,
  refresh_minutes: z.int().positive(),
  country: PLANNER_HOLIDAY_COUNTRY,
  state: PLANNER_HOLIDAY_STATE.nullable(),
});

export const PLANNER_FEED_ENDPOINTS = {
  createPlannerFeed: endpoint({
    method: 'POST',
    path: '/api/planner/feeds',
    access: 'member',
    summary:
      'Subscribe to a calendar address (ics, http, https or webcal), add a public holidays calendar for a country and region, or add the birthdays calendar',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_FEED_CREATE,
    response: PLANNER_COLLECTION_ROW,
  }),
  updatePlannerFeed: endpoint({
    method: 'PATCH',
    path: '/api/planner/feeds/:collectionId',
    access: 'member',
    summary:
      'Change the address or refresh time of a subscription, or the country and region of a holidays calendar',
    params: COLLECTION_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_FEED_CHANGES,
    response: PLANNER_COLLECTION_ROW,
  }),
  refreshPlannerFeed: endpoint({
    method: 'POST',
    path: '/api/planner/feeds/:collectionId/refresh',
    access: 'member',
    summary: 'Fetch a subscribed calendar again now',
    params: COLLECTION_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_COLLECTION_ROW,
  }),
  readPlannerHolidayRegions: endpoint({
    method: 'GET',
    path: '/api/planner/holiday-regions',
    access: 'member',
    summary: 'The countries and their regions that have a public holidays calendar',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PLANNER_HOLIDAY_REGION),
  }),
  importPlannerCalendar: endpoint({
    method: 'POST',
    path: '/api/planner/collections/:collectionId/import',
    access: 'member',
    summary:
      'Import an .ics file into a calendar as the raw body; events and to-dos with a known UID are updated and the answer lists what was added, updated and not understood',
    params: COLLECTION_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: RAW_CALENDAR,
    response: PLANNER_IMPORT_RESULT,
  }),
  exportPlannerCalendar: endpoint({
    method: 'GET',
    path: '/api/planner/collections/:collectionId/export.ics',
    access: 'member',
    summary: 'A whole calendar as an .ics file with its repeats, reminders and guests',
    params: COLLECTION_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: RAW_CALENDAR,
  }),
  exportPlannerItem: endpoint({
    method: 'GET',
    path: '/api/planner/items/:itemId/export.ics',
    access: 'member',
    summary: 'One event or task as an .ics file',
    params: ITEM_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: RAW_CALENDAR,
  }),
  readPlannerExportLink: endpoint({
    method: 'GET',
    path: '/api/planner/collections/:collectionId/export-link',
    access: 'member',
    summary:
      'The secret feed address a calendar is published at, or nothing when it is not published',
    params: COLLECTION_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_EXPORT_LINK.nullable(),
  }),
  createPlannerExportLink: endpoint({
    method: 'POST',
    path: '/api/planner/collections/:collectionId/export-link',
    access: 'member',
    summary:
      'Publish a calendar at a secret feed address, or reset the address so the old one stops working',
    params: COLLECTION_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_EXPORT_LINK,
  }),
  deletePlannerExportLink: endpoint({
    method: 'DELETE',
    path: '/api/planner/collections/:collectionId/export-link',
    access: 'member',
    summary: 'Stop publishing a calendar at its feed address',
    params: COLLECTION_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
