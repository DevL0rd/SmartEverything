import { z } from 'zod';
import { MEDIA_SIZE } from './access';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, MOMENT, NOTHING, TIME_WINDOW, queryLimit } from './primitives';
import {
  BUTTON_NAME,
  CAMERA_ROW,
  IR_CODE_FORMAT,
  IR_CODE_ROW,
  IR_REMOTE_ROW,
  RECORDING_ROW,
  REMOTE_NAME,
} from './rows-media';

export const SESSION_DESCRIPTION = z.strictObject({ sdp: z.string().min(1).max(200_000) });

export const MEDIA_LINK = z.strictObject({
  url: z.string().startsWith('/media/'),
  expiresAt: MOMENT,
});

export type MediaLink = z.infer<typeof MEDIA_LINK>;

export const RECORDING_LINK = MEDIA_LINK.extend({ id: ID });

const CAMERA_PARAMS = z.strictObject({ deviceId: ID });

const CAMERA_ENDPOINTS = {
  listCameras: endpoint({
    method: 'GET',
    path: '/api/cameras',
    access: 'member',
    summary: 'Every camera, its stream, PTZ, two-way audio and recording setting',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(CAMERA_ROW),
  }),
  updateCamera: endpoint({
    method: 'PATCH',
    path: '/api/cameras/:deviceId',
    access: 'member',
    summary: 'Turn recording of events on or off for a camera',
    params: CAMERA_PARAMS,
    query: NOTHING,
    body: z.strictObject({ record_events: z.boolean() }),
    response: CAMERA_ROW,
  }),
  offerCamera: endpoint({
    method: 'POST',
    path: '/api/cameras/:deviceId/webrtc',
    access: 'member',
    summary: 'Relay a WebRTC offer to go2rtc and return its answer with gathered candidates',
    params: CAMERA_PARAMS,
    query: NOTHING,
    body: SESSION_DESCRIPTION,
    response: SESSION_DESCRIPTION,
  }),
  talkCamera: endpoint({
    method: 'POST',
    path: '/api/cameras/:deviceId/talk',
    access: 'member',
    summary: 'A WebRTC offer that may send talk-back audio to this camera, only while talking',
    params: CAMERA_PARAMS,
    query: NOTHING,
    body: SESSION_DESCRIPTION,
    response: SESSION_DESCRIPTION,
  }),
  cameraStream: endpoint({
    method: 'POST',
    path: '/api/cameras/:deviceId/mse',
    access: 'member',
    summary: 'A short-lived signed WebSocket path for the MSE stream when WebRTC cannot connect',
    params: CAMERA_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: MEDIA_LINK,
  }),
  cameraSnapshot: endpoint({
    method: 'GET',
    path: '/api/cameras/:deviceId/snapshot',
    access: 'member',
    summary:
      'A short-lived signed path to a JPEG frame of the live stream, full size or a thumbnail',
    params: CAMERA_PARAMS,
    query: z.strictObject({ size: MEDIA_SIZE.default('full') }),
    body: NO_BODY,
    response: MEDIA_LINK,
  }),
  listRecordings: endpoint({
    method: 'GET',
    path: '/api/recordings',
    access: 'member',
    summary: 'Snapshots and clips, newest first, optionally for some cameras and a time range',
    params: NOTHING,
    query: z.strictObject({ ...TIME_WINDOW, limit: queryLimit(200, 1000) }),
    body: NO_BODY,
    response: z.array(RECORDING_ROW),
  }),
  recordingLinks: endpoint({
    method: 'POST',
    path: '/api/recordings/links',
    access: 'member',
    summary: 'Short-lived signed paths that download recordings, or thumbnails of snapshots',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ ids: z.array(ID).min(1).max(200), size: MEDIA_SIZE.default('full') }),
    response: z.array(RECORDING_LINK),
  }),
  removeEvent: endpoint({
    method: 'DELETE',
    path: '/api/events/:eventId',
    access: 'member',
    summary: 'Delete an event together with its snapshot and clip',
    params: z.strictObject({ eventId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  removeRecording: endpoint({
    method: 'DELETE',
    path: '/api/recordings/:recordingId',
    access: 'member',
    summary: 'Delete a recording and its file',
    params: z.strictObject({ recordingId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;

const IR_ENDPOINTS = {
  listIrRemotes: endpoint({
    method: 'GET',
    path: '/api/ir-remotes',
    access: 'member',
    summary: 'Every remote taught to an IR blaster',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(IR_REMOTE_ROW),
  }),
  createIrRemote: endpoint({
    method: 'POST',
    path: '/api/ir-remotes',
    access: 'member',
    summary: 'Add a remote to an IR blaster',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      blaster_id: ID,
      name: REMOTE_NAME,
      category: z.string().min(1).max(40),
      brand: z.string().min(1).max(80).nullable(),
    }),
    response: IR_REMOTE_ROW,
  }),
  removeIrRemote: endpoint({
    method: 'DELETE',
    path: '/api/ir-remotes/:remoteId',
    access: 'member',
    summary: 'Remove a remote and its codes',
    params: z.strictObject({ remoteId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  listIrCodes: endpoint({
    method: 'GET',
    path: '/api/ir-codes',
    access: 'member',
    summary: 'Every learned or library IR code',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(IR_CODE_ROW),
  }),
  saveIrCode: endpoint({
    method: 'PUT',
    path: '/api/ir-codes',
    access: 'member',
    summary: 'Save the code of a button, replacing the one it had',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({
      remote_id: ID,
      button: BUTTON_NAME,
      format: IR_CODE_FORMAT,
      code: z.string().min(1).max(20_000),
    }),
    response: IR_CODE_ROW,
  }),
  removeIrCode: endpoint({
    method: 'DELETE',
    path: '/api/ir-codes/:codeId',
    access: 'member',
    summary: 'Forget the code of a button',
    params: z.strictObject({ codeId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;

export const MEDIA_ENDPOINTS = { ...CAMERA_ENDPOINTS, ...IR_ENDPOINTS } as const;
