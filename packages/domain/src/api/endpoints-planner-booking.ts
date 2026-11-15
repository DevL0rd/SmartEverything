import { z } from 'zod';
import {
  PLANNER_BOOKING_PAGE_CHANGES,
  PLANNER_BOOKING_PAGE_CREATE,
  PLANNER_BOOKING_PAGE_ROW,
} from '../planner/booking';
import { NO_BODY, endpoint } from './endpoint';
import { PLANNER_PERSON_QUERY } from './endpoints-planner-items';
import { DONE, ID, NOTHING } from './primitives';

const PAGE_PARAMS = z.strictObject({ pageId: ID });

export const PLANNER_BOOKING_ENDPOINTS = {
  listPlannerBookingPages: endpoint({
    method: 'GET',
    path: '/api/planner/booking-pages',
    access: 'member',
    summary: 'The booking pages of a person, where others pick a time on their calendar',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: z.array(PLANNER_BOOKING_PAGE_ROW),
  }),
  createPlannerBookingPage: endpoint({
    method: 'POST',
    path: '/api/planner/booking-pages',
    access: 'member',
    summary:
      'Add a booking page with its length, weekly availability, buffers, notice and calendar',
    params: NOTHING,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_BOOKING_PAGE_CREATE,
    response: PLANNER_BOOKING_PAGE_ROW,
  }),
  updatePlannerBookingPage: endpoint({
    method: 'PATCH',
    path: '/api/planner/booking-pages/:pageId',
    access: 'member',
    summary: 'Change a booking page or switch it on or off',
    params: PAGE_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: PLANNER_BOOKING_PAGE_CHANGES,
    response: PLANNER_BOOKING_PAGE_ROW,
  }),
  deletePlannerBookingPage: endpoint({
    method: 'DELETE',
    path: '/api/planner/booking-pages/:pageId',
    access: 'member',
    summary: 'Delete a booking page; bookings already made stay on the calendar',
    params: PAGE_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: DONE,
  }),
  resetPlannerBookingLink: endpoint({
    method: 'POST',
    path: '/api/planner/booking-pages/:pageId/reset-link',
    access: 'member',
    summary: 'Give a booking page a new link so the old one stops working',
    params: PAGE_PARAMS,
    query: PLANNER_PERSON_QUERY,
    body: NO_BODY,
    response: PLANNER_BOOKING_PAGE_ROW,
  }),
} as const;
