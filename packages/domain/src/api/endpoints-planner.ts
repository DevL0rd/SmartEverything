import { z } from 'zod';
import {
  PLANNER_COLLECTION_KINDS,
  PLANNER_COLLECTION_ROW,
  PLANNER_COLOUR,
  PLANNER_REMINDERS,
} from '../planner/collections';
import { PLANNER_DAY } from '../planner/day';
import { PLANNER_ITEM_KINDS, PLANNER_LOCAL_DATE } from '../planner/items';
import { PLANNER_PREFERENCES } from '../planner/preferences';
import { PLANNER_RANGE } from '../planner/range';
import { PLANNER_SEARCH_PAGE, PLANNER_SEARCH_WHEN } from '../planner/search';
import { PLANNER_STATS, PLANNER_STATS_RANGES } from '../planner/stats';
import { NO_BODY, endpoint } from './endpoint';
import { PLANNER_CLOCK_ENDPOINTS } from './endpoints-planner-clock';
import { PLANNER_ITEM_ENDPOINTS, PLANNER_PERSON_QUERY } from './endpoints-planner-items';
import { PLANNER_BOOKING_ENDPOINTS } from './endpoints-planner-booking';
import { PLANNER_FEED_ENDPOINTS } from './endpoints-planner-feeds';
import { PLANNER_SHARING_ENDPOINTS } from './endpoints-planner-sharing';
import { DONE, ID, MOMENT, NOTHING, queryList, somethingToChange } from './primitives';

export const PLANNER_DAY_QUERY = z.strictObject({
  personId: ID.optional(),
  date: PLANNER_LOCAL_DATE,
});

export const PLANNER_RANGE_QUERY = z
  .strictObject({
    personId: ID.optional(),
    from: MOMENT,
    to: MOMENT,
    collections: queryList(ID).optional(),
  })
  .refine((query) => Date.parse(query.from) <= Date.parse(query.to), {
    path: ['to'],
    message: 'the range ends after it starts',
  });

export const PLANNER_SEARCH_QUERY = z.strictObject({
  personId: ID.optional(),
  text: z.string().trim().min(1),
  collections: queryList(ID).optional(),
  kinds: queryList(z.enum(PLANNER_ITEM_KINDS)).optional(),
  when: z.enum(PLANNER_SEARCH_WHEN).default('all'),
  cursor: z.string().min(1).optional(),
});

export const PLANNER_STATS_QUERY = z.strictObject({
  personId: ID.optional(),
  range: z.enum(PLANNER_STATS_RANGES),
});

const COLLECTION_FIELDS = {
  name: z.string().trim().min(1),
  colour: PLANNER_COLOUR,
  icon: z.string().trim().min(1),
  position: z.number(),
  visible: z.boolean(),
  default_reminders: PLANNER_REMINDERS,
} as const;

export const PLANNER_COLLECTION_CREATE = z.strictObject({
  kind: z.enum(PLANNER_COLLECTION_KINDS),
  name: COLLECTION_FIELDS.name,
  colour: COLLECTION_FIELDS.colour,
  icon: COLLECTION_FIELDS.icon,
  position: COLLECTION_FIELDS.position.optional(),
  visible: COLLECTION_FIELDS.visible.default(true),
  default_reminders: COLLECTION_FIELDS.default_reminders.default([]),
});

export const PLANNER_COLLECTION_CHANGES = somethingToChange(COLLECTION_FIELDS);

const COLLECTION_PARAMS = z.strictObject({ collectionId: ID });

export const PLANNER_ENDPOINTS = {
  readPlannerDay: endpoint({
    method: 'GET',
    path: '/api/planner/day',
    access: 'member',
    summary:
      'The composed day: what was missed, what is on now, what is coming, what is done, what happened, the rings and the day strip',
    params: NOTHING,
    query: PLANNER_DAY_QUERY,
    body: NO_BODY,
    response: PLANNER_DAY,
  }),
  readPlannerRange: endpoint({
    method: 'GET',
    path: '/api/planner/range',
    access: 'member',
    summary: 'Occurrences of tasks and events between two moments, repeats expanded',
    params: NOTHING,
    query: PLANNER_RANGE_QUERY,
    body: NO_BODY,
    response: PLANNER_RANGE,
  }),
  readPlannerSearch: endpoint({
    method: 'GET',
    path: '/api/planner/search',
    access: 'member',
    summary:
      'Search events and tasks by title, notes, location, guests and calendar name across everything the person may see; each hit carries its next or last occurrence',
    params: NOTHING,
    query: PLANNER_SEARCH_QUERY,
    body: NO_BODY,
    response: PLANNER_SEARCH_PAGE,
  }),
  readPlannerStats: endpoint({
    method: 'GET',
    path: '/api/planner/stats',
    access: 'member',
    summary:
      'Planner figures for a week, month or year: completion, on time, streaks, best hours, time by calendar, load, device share, list trends, timer use and alarm consistency',
    params: NOTHING,
    query: PLANNER_STATS_QUERY,
    body: NO_BODY,
    response: PLANNER_STATS,
  }),
  createPlannerCollection: endpoint({
    method: 'POST',
    path: '/api/planner/collections',
    access: 'member',
    summary:
      'Add a calendar or a list; repeating a create with the same client id returns the one already made',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_COLLECTION_CREATE.extend({
      id: ID.optional().describe('Id the client generated for the new calendar or list'),
    }),
    response: PLANNER_COLLECTION_ROW,
  }),
  updatePlannerCollection: endpoint({
    method: 'PATCH',
    path: '/api/planner/collections/:collectionId',
    access: 'member',
    summary: 'Rename, recolour, reorder, show or hide a calendar or list',
    params: COLLECTION_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_COLLECTION_CHANGES,
    response: PLANNER_COLLECTION_ROW,
  }),
  deletePlannerCollection: endpoint({
    method: 'DELETE',
    path: '/api/planner/collections/:collectionId',
    access: 'member',
    summary: 'Delete a calendar or list with its items',
    params: COLLECTION_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: DONE,
  }),
  readPlannerPreferences: endpoint({
    method: 'GET',
    path: '/api/planner/preferences',
    access: 'member',
    summary: 'The planner settings of a person',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_PREFERENCES,
  }),
  writePlannerPreferences: endpoint({
    method: 'PUT',
    path: '/api/planner/preferences',
    access: 'member',
    summary: 'Replace the planner settings of a person',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_PREFERENCES,
    response: PLANNER_PREFERENCES,
  }),
  ...PLANNER_ITEM_ENDPOINTS,
  ...PLANNER_CLOCK_ENDPOINTS,
  ...PLANNER_SHARING_ENDPOINTS,
  ...PLANNER_FEED_ENDPOINTS,
  ...PLANNER_BOOKING_ENDPOINTS,
} as const;
