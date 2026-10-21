import { z } from 'zod';
import {
  BRUSH_ACTION_ANSWER,
  BRUSH_ACTION_RESULT,
  BRUSH_BATCH_RESULT,
  BRUSH_FRAME_BATCH,
  PHONE_BRUSHES,
} from '../toothbrush-link';
import { BRUSH_ACTION, BRUSH_READ_QUERY, BRUSH_VIEW } from '../toothbrush-views';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

export const TOOTHBRUSH_AREA_ENDPOINTS = {
  readPhoneBrushes: endpoint({
    method: 'GET',
    path: '/api/toothbrushes/mine',
    access: 'member',
    summary:
      'The toothbrushes this phone may hold over Bluetooth, with exactly what to subscribe to and read',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PHONE_BRUSHES,
  }),
  reportBrushFrames: endpoint({
    method: 'POST',
    path: '/api/toothbrushes/:deviceId/frames',
    access: 'member',
    summary:
      'The Bluetooth frames the phone holding a toothbrush received, and the state of its link',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: BRUSH_FRAME_BATCH,
    response: BRUSH_BATCH_RESULT,
  }),
  answerBrushAction: endpoint({
    method: 'POST',
    path: '/api/toothbrushes/action-results',
    access: 'member',
    summary: 'A phone answers the toothbrush command the hub sent it',
    params: NOTHING,
    query: NOTHING,
    body: BRUSH_ACTION_ANSWER,
    response: DONE,
  }),
  readToothbrush: endpoint({
    method: 'GET',
    path: '/api/toothbrushes/:deviceId',
    access: 'member',
    summary:
      'Read a Sonicare or Oral-B toothbrush: view state (activity, live brushing, battery, brush head, today, streak, last session), sessions (list), session (one), stats (day, week, month or year totals, averages, time of day, modes, zones, bests, streaks, heatmap, consistency), head (wear, forecast, timeline), battery (levels, charges, days per charge), handle (motor hours), settings, diagnostics (owner). Sessions belong to the person who brushes; a member sees only their own',
    params: z.strictObject({ deviceId: ID }),
    query: BRUSH_READ_QUERY,
    body: NO_BODY,
    response: BRUSH_VIEW,
  }),
  actToothbrush: endpoint({
    method: 'POST',
    path: '/api/toothbrushes/:deviceId/actions',
    access: 'member',
    summary:
      'Act on a toothbrush: assign a session to a person, say who brushes with it, set a person’s brushing goal (sessions per day, minimum seconds, morning and evening hours), change settings (connection policy, alerts, sensors, defaults, handle change consent, model pick; owner), make this phone hold the Bluetooth link, forget a session, or turn the raw frame log on or off (owner). Oral-B only: set_mode_order, reset_head_reminder, snooze_head_reminder, and probe (owner; a handle test that talks to the real brush, so ask the person first). Mode, intensity and feedback switches go through device_control; pairing is a human step in the app',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: BRUSH_ACTION,
    response: BRUSH_ACTION_RESULT,
  }),
} as const;
