import { z } from 'zod';
import { AUDIO_CHANGE, AUDIO_STATE } from '../node/computer-audio';
import { DISPLAY_CHANGE, DISPLAY_DECISION, DISPLAY_STATE } from '../node/computer-displays';
import {
  COMPUTER_DOWNLOAD,
  DOWNLOAD_PATHS,
  FILE_PATH,
  FILE_PLACES,
  FILE_PROPERTIES,
  FILE_SEARCH_RESULT,
  FILE_UPLOAD_CHUNK,
  FILE_UPLOAD_RESULT,
  FILE_WRITE_CHANGE,
  FILE_WRITE_RESULT,
} from '../node/computer-files';
import { PROCESS_DETAIL } from '../node/computer-processes';
import {
  SERVICE_REQUEST,
  SERVICES_STATE,
  STARTUP_CHANGE,
  STARTUP_STATE,
  SYSTEM_CHANGE,
  SYSTEM_STATE,
} from '../node/computer-system';
import { WINDOW_CHANGE, WINDOWS_STATE } from '../node/computer-windows';
import { HISTORY_BACKFILL_REQUEST, HISTORY_BACKFILL_RESPONSE } from '../history-backfill';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

const COMPUTER_PARAMS = z.strictObject({ deviceId: ID });

const PROCESS_PARAMS = z.strictObject({ deviceId: ID, pid: z.string().regex(/^[1-9][0-9]*$/) });

export const COMPUTER_SYSTEM_ENDPOINTS = {
  readComputerAudio: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/audio',
    access: 'member',
    summary:
      'Sound on a computer: outputs and inputs with volume, mute and the default, and each app playing with its volume, mute and output',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AUDIO_STATE,
  }),
  changeComputerAudio: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/audio',
    access: 'member',
    summary:
      'Set the volume or mute of an output, input or app on a computer, change the default output or input, or move an app to another output; answers with the sound state after the change',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: AUDIO_CHANGE,
    response: AUDIO_STATE,
  }),
  readComputerDisplays: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/displays',
    access: 'member',
    summary:
      'Screens on a computer: each with resolution, refresh rate, scale, orientation, position, brightness and whether it is on, plus night light and any change waiting to be kept',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DISPLAY_STATE,
  }),
  changeComputerDisplay: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/displays',
    access: 'member',
    summary:
      'Turn a screen on or off, change its resolution, refresh rate, scale, orientation, position, primary, mirror, brightness, HDR or adaptive sync, or set night light; changes that can blank a screen go back after 15 seconds unless kept',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: DISPLAY_CHANGE,
    response: DISPLAY_STATE,
  }),
  confirmComputerDisplay: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/displays/confirm',
    access: 'member',
    summary: 'Keep or revert the screen change that is waiting on a computer',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: DISPLAY_DECISION,
    response: DISPLAY_STATE,
  }),
  readComputerSystem: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/system',
    access: 'member',
    summary:
      'System state of a computer: battery, power mode, Do Not Disturb, keyboard layout, Wi-Fi, Bluetooth and USB devices',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: SYSTEM_STATE,
  }),
  changeComputerSystem: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/system',
    access: 'member',
    summary:
      'Change power mode, Do Not Disturb, keyboard layout, Wi-Fi (on or off, connect to a saved network) or Bluetooth (on or off, connect or disconnect a device) on a computer',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: SYSTEM_CHANGE,
    response: SYSTEM_STATE,
  }),
  readComputerWindows: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/windows',
    access: 'member',
    summary: 'Open windows on a computer with their app, desktop and whether they are minimised',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: WINDOWS_STATE,
  }),
  changeComputerWindow: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/windows',
    access: 'member',
    summary:
      'Bring a window to the front, minimise it or close it; the app asks to save if it needs to',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: WINDOW_CHANGE,
    response: WINDOWS_STATE,
  }),
  readComputerStartup: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/startup',
    access: 'member',
    summary: 'Apps that start when the person signs in to a computer, and whether each is on',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: STARTUP_STATE,
  }),
  changeComputerStartup: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/startup',
    access: 'member',
    summary: 'Turn an app on or off at sign-in on a computer',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: STARTUP_CHANGE,
    response: STARTUP_STATE,
  }),
  readComputerServices: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/services',
    access: 'member',
    summary:
      'Background services of the signed-in person on a computer, system services read-only, and scheduled timers with their next and last run',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: SERVICES_STATE,
  }),
  changeComputerService: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/services',
    access: 'member',
    summary:
      'Start, stop, restart, enable or disable one of the signed-in person’s services on a computer',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: SERVICE_REQUEST,
    response: SERVICES_STATE,
  }),
  readComputerProcess: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/processes/:pid',
    access: 'member',
    summary:
      'One program on a computer in detail: command, location, start time, parent, children, user, threads, open files and sockets',
    params: PROCESS_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: PROCESS_DETAIL,
  }),
  prioritiseComputerProcess: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/processes/:pid/priority',
    access: 'member',
    summary:
      'Lower or restore the priority of a program on a computer (nice 0 normal, 10 low, 19 lowest); raising above the current level needs permission on the computer',
    params: PROCESS_PARAMS,
    query: NOTHING,
    body: z.strictObject({ nice: z.int().min(-20).max(19) }),
    response: DONE,
  }),
  searchComputerFiles: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/files/search',
    access: 'member',
    summary:
      'Search a folder and everything below it for file and folder names containing some text; pass next from the answer as cursor to continue the search',
    params: COMPUTER_PARAMS,
    query: z.strictObject({
      path: FILE_PATH,
      text: z.string().trim().min(1).max(200),
      cursor: z.string().min(1).optional(),
    }),
    body: NO_BODY,
    response: FILE_SEARCH_RESULT,
  }),
  readComputerFileProperties: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/files/properties',
    access: 'member',
    summary: 'Size, kind, owner, permissions and dates of one file or folder on a computer',
    params: COMPUTER_PARAMS,
    query: z.strictObject({ path: FILE_PATH }),
    body: NO_BODY,
    response: FILE_PROPERTIES,
  }),
  writeComputerFiles: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/files/write',
    access: 'member',
    summary:
      'Make a folder, rename, move, copy, move to Trash or restore from Trash on a computer; nothing is deleted for good and nothing is overwritten unless replace is set',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: FILE_WRITE_CHANGE,
    response: FILE_WRITE_RESULT,
  }),
  uploadComputerFile: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/files/upload',
    access: 'member',
    summary:
      'Write one piece of a file to a computer; send the pieces in order with start as the byte offset and final on the last',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: FILE_UPLOAD_CHUNK,
    response: FILE_UPLOAD_RESULT,
  }),
  readComputerPlaces: endpoint({
    method: 'GET',
    path: '/api/computers/:deviceId/files/places',
    access: 'member',
    summary:
      'Where to start browsing a computer: its home folder, the top of the drive, the usual folders (Downloads, Desktop, Documents) and its mounted drives',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: FILE_PLACES,
  }),
  prepareComputerDownload: endpoint({
    method: 'POST',
    path: '/api/computers/:deviceId/downloads',
    access: 'member',
    summary:
      'Get ready to download files or folders from a computer: one file stays as it is, a folder or several items become one zip built while it streams; answers the name, size, counts, anything that cannot be included and a short-lived signed link to fetch it from (Range supported for single files)',
    params: COMPUTER_PARAMS,
    query: NOTHING,
    body: z.strictObject({ paths: DOWNLOAD_PATHS }),
    response: COMPUTER_DOWNLOAD,
  }),
  readHistoryBackfill: endpoint({
    method: 'POST',
    path: '/api/history/backfill',
    access: 'member',
    summary:
      'Recorded readings of a computer, the hub, the router, Syncthing, AdGuard or another source since a moment or for a window, as timestamps and one column per series, with the interval and window it is recorded at and whether it was thinned to fit; reads only',
    params: NOTHING,
    query: NOTHING,
    body: HISTORY_BACKFILL_REQUEST,
    response: HISTORY_BACKFILL_RESPONSE,
  }),
};
