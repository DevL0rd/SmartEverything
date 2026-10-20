import {
  DEVELOPER_DEVICE,
  WATCH_CAPTURE_SAVED,
  WATCH_CAPTURE_SUMMARY,
  WATCH_CAPTURE_UPLOAD,
} from '../watch-captures';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, NOTHING } from './primitives';

export const DEVELOPER_ENDPOINTS = {
  readDeveloperDevice: endpoint({
    method: 'GET',
    path: '/api/developer/device',
    access: 'owner',
    summary: 'Whether this paired device is a developer device',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DEVELOPER_DEVICE,
  }),
  setDeveloperDevice: endpoint({
    method: 'PUT',
    path: '/api/developer/device',
    access: 'owner',
    summary: 'Mark or unmark this paired device as a developer device',
    params: NOTHING,
    query: NOTHING,
    body: DEVELOPER_DEVICE,
    response: DEVELOPER_DEVICE,
  }),
  saveWatchCaptures: endpoint({
    method: 'POST',
    path: '/api/developer/watch-captures',
    access: 'owner',
    summary: 'Raw watch files a developer device read during a sync, kept once each by content',
    params: NOTHING,
    query: NOTHING,
    body: WATCH_CAPTURE_UPLOAD,
    response: WATCH_CAPTURE_SAVED,
  }),
  readWatchCaptures: endpoint({
    method: 'GET',
    path: '/api/developer/watch-captures',
    access: 'owner',
    summary: 'The raw watch files kept for developers, with their total size',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: WATCH_CAPTURE_SUMMARY,
  }),
  clearWatchCaptures: endpoint({
    method: 'DELETE',
    path: '/api/developer/watch-captures',
    access: 'owner',
    summary: 'Delete every raw watch file kept for developers',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
