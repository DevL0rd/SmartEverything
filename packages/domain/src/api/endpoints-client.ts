import { z } from 'zod';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, JSON_OBJECT, NOTHING } from './primitives';
import {
  LAYOUT_PAGE_NAME,
  LAYOUT_ROW,
  PUSH_PLATFORMS,
  PUSH_TARGET_ROW,
  PUSH_TOKEN,
} from './rows-media';

const LAYOUT_PARAMS = z.strictObject({ page: LAYOUT_PAGE_NAME });

export const STORED_LAYOUT = z.strictObject({ layout: JSON_OBJECT.nullable() });

export const CLIENT_ENDPOINTS = {
  readLayout: endpoint({
    method: 'GET',
    path: '/api/layouts/:page',
    access: 'member',
    summary: 'The calling client’s saved layout or setting for a page',
    params: LAYOUT_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: STORED_LAYOUT,
  }),
  saveLayout: endpoint({
    method: 'PUT',
    path: '/api/layouts/:page',
    access: 'member',
    summary: 'Save the calling client’s layout or setting for a page',
    params: LAYOUT_PARAMS,
    query: NOTHING,
    body: z.strictObject({ layout: JSON_OBJECT }),
    response: LAYOUT_ROW,
  }),
  listPushTargets: endpoint({
    method: 'GET',
    path: '/api/push-targets',
    access: 'owner',
    summary: 'Every phone registered for push notifications',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: z.array(PUSH_TARGET_ROW),
  }),
  savePushTarget: endpoint({
    method: 'PUT',
    path: '/api/push-targets',
    access: 'member',
    summary: 'Register the calling phone’s Firebase token',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ token: PUSH_TOKEN, platform: z.enum(PUSH_PLATFORMS) }),
    response: PUSH_TARGET_ROW,
  }),
  removePushTarget: endpoint({
    method: 'DELETE',
    path: '/api/push-targets',
    access: 'member',
    summary: 'Forget a Firebase token of the calling phone',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ token: PUSH_TOKEN }),
    response: DONE,
  }),
} as const;
