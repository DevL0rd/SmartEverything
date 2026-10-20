import { z } from 'zod';
import {
  BOTTLE_ACTION_ANSWER,
  PHONE_BOTTLES,
  BOTTLE_SYNC_RESULT,
  BOTTLE_SYNC_UPLOAD,
} from '../bottle';
import {
  BOTTLE_ACT_RESULT,
  BOTTLE_ACTION,
  BOTTLE_ADD,
  BOTTLE_READ_QUERY,
  BOTTLE_UV_START,
  BOTTLE_VIEW,
} from '../bottle-actions';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';
import { DEVICE_ROW } from './rows-home';

export const BOTTLE_AREA_ENDPOINTS = {
  readPhoneBottles: endpoint({
    method: 'GET',
    path: '/api/bottles/mine',
    access: 'member',
    summary:
      'The water bottles this phone may sync over Bluetooth, with exactly what to ask each cap',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: PHONE_BOTTLES,
  }),
  uploadBottleSync: endpoint({
    method: 'POST',
    path: '/api/bottles/:deviceId/sync',
    access: 'member',
    summary: 'What the phone read from a water bottle cap while it was awake',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: BOTTLE_SYNC_UPLOAD,
    response: BOTTLE_SYNC_RESULT,
  }),
  answerBottleAction: endpoint({
    method: 'POST',
    path: '/api/bottles/action-results',
    access: 'member',
    summary: 'A phone answers the bottle action the hub sent it',
    params: NOTHING,
    query: NOTHING,
    body: BOTTLE_ACTION_ANSWER,
    response: DONE,
  }),
  addBottle: endpoint({
    method: 'POST',
    path: '/api/bottles',
    access: 'member',
    summary:
      'Add a water bottle a phone found over Bluetooth; members bind it to themselves, the owner to anyone',
    params: NOTHING,
    query: NOTHING,
    body: BOTTLE_ADD,
    response: DEVICE_ROW,
  }),
  forgetBottle: endpoint({
    method: 'DELETE',
    path: '/api/bottles/:deviceId',
    access: 'member',
    summary:
      'Forget a water bottle and its readings; the owner or the bound person; drinks already in the water log stay',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  readBottle: endpoint({
    method: 'GET',
    path: '/api/bottles/:deviceId',
    access: 'member',
    summary:
      'Read a water bottle: status (level, battery, cap state, today, pace), drinks, readings, sessions (fill to fill), stats (day, week, month or year totals, averages, bests, streaks, calendar, rhythm), care (UV cycles, battery, charges, filter, faults), settings (reminder, quiet hours, calibration, syncs) or diagnostics',
    params: z.strictObject({ deviceId: ID }),
    query: BOTTLE_READ_QUERY,
    body: NO_BODY,
    response: BOTTLE_VIEW,
  }),
  actBottle: endpoint({
    method: 'POST',
    path: '/api/bottles/:deviceId/actions',
    access: 'member',
    summary:
      'Act on a water bottle with an action from the schema: sync, measure (level now, bottle upright and still), read the sensors or the orientation, stop a UV clean, take over (this phone syncs it), recompute past drinks, set the reminder (state, interval, window, colour), set quiet hours, set the bottle size, set or reset the filter, choose whose drinks, keep a link, set or clear the calibration; reminder and quiet hours apply when the bottle next wakes',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: BOTTLE_ACTION,
    response: BOTTLE_ACT_RESULT,
  }),
  startBottleUv: endpoint({
    method: 'POST',
    path: '/api/bottles/:deviceId/uv',
    access: 'member',
    summary: 'Start a UV clean on a bottle cap; a person at the bottle only, never an assistant',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: BOTTLE_UV_START,
    response: BOTTLE_ACT_RESULT,
  }),
} as const;
