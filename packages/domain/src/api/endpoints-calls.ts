import { z } from 'zod';
import { CALL_SOURCE } from '../assistant-voice';
import { SIGHT_LABEL_MAX, SIGHT_MODE, SIGHT_SOURCE } from '../call-sight';
import { NO_BODY, endpoint } from './endpoint';
import { ID, MOMENT, NOTHING } from './primitives';

export const CALL_SIGHT_ROW = z.strictObject({
  source: SIGHT_SOURCE.describe('What the assistant is looking at'),
  label: z.string().max(SIGHT_LABEL_MAX).describe('Its name, such as the camera or window'),
  mode: SIGHT_MODE.describe('live streams pictures, on_demand takes a still when needed'),
});

export type CallSightRow = z.infer<typeof CALL_SIGHT_ROW>;

export const CALL_ROW = z.strictObject({
  callId: ID,
  chatId: ID,
  profileId: ID,
  clientId: ID,
  source: CALL_SOURCE,
  device: z.string().max(80),
  startedAt: MOMENT,
  muted: z.boolean(),
  sight: CALL_SIGHT_ROW.nullable(),
  looks: z.int().min(0).describe('How many stills the assistant has taken in this call'),
});

export type CallRow = z.infer<typeof CALL_ROW>;

const CALL_PARAMS = z.strictObject({ callId: ID });

export const SHOW_CAMERA_IN_CALL = z.strictObject({
  cameraId: ID.describe('A home camera, from list_devices'),
});

export const CALL_ENDPOINTS = {
  listCalls: endpoint({
    method: 'GET',
    path: '/api/reach/calls',
    access: 'member',
    summary:
      'Voice calls running now with the app (yours; owners see everyone’s): who, since when, muted or not, and what the assistant is looking at, if anything',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(CALL_ROW),
  }),
  showCameraInCall: endpoint({
    method: 'POST',
    path: '/api/reach/calls/:callId/sight',
    access: 'member',
    summary:
      'Show a home camera to the assistant in a running call; replaces what it was looking at. The person’s own camera and screen can only be shared by them, in the app',
    params: CALL_PARAMS,
    query: NOTHING,
    body: SHOW_CAMERA_IN_CALL,
    response: CALL_ROW,
  }),
  stopSightInCall: endpoint({
    method: 'POST',
    path: '/api/reach/calls/:callId/sight/stop',
    access: 'member',
    summary:
      'Stop the assistant looking at anything in a running call (camera, screen or window); the call goes on',
    params: CALL_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: CALL_ROW,
  }),
} as const;
