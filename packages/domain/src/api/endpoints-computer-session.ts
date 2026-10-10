import { z } from 'zod';
import { APP_CLOSED, COMPUTER_APPS } from '../node/computer-apps';
import { CAPTURE_TARGETS, COMPUTER_CAPTURE } from '../node/computer-capture';
import { FILE_CONTENT, FILE_LIST, FILE_PATH } from '../node/computer-files';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

const COMPUTER_PARAMS = z.strictObject({ deviceId: ID });

const APP_BODY = z.strictObject({ appId: z.string().min(1).max(200) });

export const COMPUTER_SESSION_ENDPOINTS = {
  listComputerApps: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/apps',
    access: 'owner',
    summary:
      'Apps installed on a computer, the app in front now and how long each app was in front today and this week',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: COMPUTER_APPS,
  }),
  openComputerApp: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/apps/open',
    access: 'owner',
    summary: 'Open an installed app on a computer for the signed-in person',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: APP_BODY,
    response: DONE,
  }),
  closeComputerApp: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/apps/close',
    access: 'owner',
    summary:
      'Close every window of an app on a computer; force ends its programs at once and unsaved work is lost',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: APP_BODY.extend({ force: z.boolean().default(false) }),
    response: APP_CLOSED,
  }),
  listComputerFiles: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/files',
    access: 'owner',
    summary:
      'Files and folders in a folder of the signed-in person’s home on a computer (the home folder when no path), up to 500',
    params: COMPUTER_PARAMS,
    query: z.strictObject({ path: FILE_PATH.optional() }),
    body: NO_BODY,
    response: FILE_LIST,
  }),
  readComputerFile: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/file',
    access: 'owner',
    summary:
      'One file from the signed-in person’s home on a computer, up to 5 MB: text as text, anything else as base64',
    params: COMPUTER_PARAMS,
    query: z.strictObject({ path: FILE_PATH }),
    body: NO_BODY,
    response: FILE_CONTENT,
  }),
  captureComputer: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/capture',
    access: 'owner',
    summary: 'A screenshot of a computer’s whole screen or of the window in front, as a JPEG',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: z.strictObject({ target: z.enum(CAPTURE_TARGETS).default('screen') }),
    response: COMPUTER_CAPTURE,
  }),
};
