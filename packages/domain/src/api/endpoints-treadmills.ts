import { z } from 'zod';
import {
  PHONE_TREADMILLS,
  TREADMILL_ACTION_ANSWER,
  TREADMILL_ACTION_RESULT,
  TREADMILL_BATCH_RESULT,
  TREADMILL_FRAME_BATCH,
} from '../treadmill';
import { TREADMILL_ACTION, TREADMILL_READ_QUERY, TREADMILL_VIEW } from '../treadmill-views';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

export const TREADMILL_AREA_ENDPOINTS = {
  readPhoneTreadmills: endpoint({
    method: 'GET',
    path: '/api/treadmills/mine',
    access: 'member',
    summary: 'The treadmills this phone may hold over Bluetooth, with exactly what to subscribe to',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PHONE_TREADMILLS,
  }),
  reportTreadmillFrames: endpoint({
    method: 'POST',
    path: '/api/treadmills/:deviceId/frames',
    access: 'member',
    summary:
      'The Bluetooth frames the phone holding a treadmill received, and the state of its link',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: TREADMILL_FRAME_BATCH,
    response: TREADMILL_BATCH_RESULT,
  }),
  answerTreadmillAction: endpoint({
    method: 'POST',
    path: '/api/treadmills/action-results',
    access: 'member',
    summary: 'A phone answers the belt command the hub sent it',
    params: NOTHING,
    query: NOTHING,
    body: TREADMILL_ACTION_ANSWER,
    response: DONE,
  }),
  readTreadmill: endpoint({
    method: 'GET',
    path: '/api/treadmills/:deviceId',
    access: 'member',
    summary:
      'Read a treadmill: view state (belt, link, incline, climb, energy and heart rate sources, live session, limits), sessions (list), session (one with its speed profile), stats (day, week, month or year totals, bests, streaks, heatmap), records (pad records), settings, diagnostics (owner)',
    params: z.strictObject({ deviceId: ID }),
    query: TREADMILL_READ_QUERY,
    body: NO_BODY,
    response: TREADMILL_VIEW,
  }),
  actTreadmill: endpoint({
    method: 'POST',
    path: '/api/treadmills/:deviceId/actions',
    access: 'member',
    summary:
      'Act on a treadmill: assign a session to a walker, say who is on the belt now, set a person’s goals (daily minutes, weekly distance and sessions), change settings (remote start and remote incline policy, incline scale, grade, running speed, stay connected, oiling days; owner), mark the belt oiled, make this phone hold the Bluetooth link (a phone next to the belt only, never the assistant or a computer), forget a session, or turn the raw frame log on or off (owner). Start, stop, speed, incline and mode go through control_devices',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: TREADMILL_ACTION,
    response: TREADMILL_ACTION_RESULT,
  }),
} as const;
