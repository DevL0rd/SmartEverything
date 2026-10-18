import { z } from 'zod';
import {
  PHONE_DETAIL,
  PHONE_DETAIL_SECTION_NAMES,
  PHONE_ICON_HASH,
  PHONE_ICON_UPLOAD,
} from '../phone-detail';
import {
  PHONE_ACTION,
  PHONE_ACTION_ANSWER,
  PHONE_ACTION_RESULT,
  PHONE_CONTEXT,
  PHONE_REPORT,
} from '../phones';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING, queryList } from './primitives';

export const PHONE_AREA_ENDPOINTS = {
  reportPhone: endpoint({
    method: 'POST',
    path: '/api/nodes/self/report',
    access: 'member',
    summary:
      'What this phone currently sees: battery, network, sound, media, screen time and its context',
    params: NOTHING,
    query: NOTHING,
    body: PHONE_REPORT,
    response: DONE,
  }),
  runPhoneAction: endpoint({
    method: 'POST',
    path: '/api/phones/:deviceId/actions',
    access: 'member',
    summary:
      'Ask a phone to ring until stopped (find my phone: maximum volume even on silent, with a Stop notification; ring on:false stops it), turn its flashlight on, off or toggle, change a volume, the ringer or Do Not Disturb, control what it plays, show a link to open, open an app, set the screen brightness, automatic brightness or screen timeout, dismiss a notification, move the playing position, set the flashlight strength, lock it, wake it to its unlock prompt, take a screenshot, receive a file the hub sent, or send a fresh report; waits for the phone to answer',
    params: z.strictObject({ deviceId: ID }),
    query: NOTHING,
    body: PHONE_ACTION,
    response: PHONE_ACTION_RESULT,
  }),
  answerPhoneAction: endpoint({
    method: 'POST',
    path: '/api/phones/actions/answer',
    access: 'member',
    summary: 'A phone answers an action it was asked to do',
    params: NOTHING,
    query: NOTHING,
    body: PHONE_ACTION_ANSWER,
    response: DONE,
  }),
  readPhoneContext: endpoint({
    method: 'GET',
    path: '/api/phones/context',
    access: 'member',
    summary:
      'What a person is doing according to their phone (still, walking, running, cycling, driving, navigating, parked), since when, how sure, and the place when they share it',
    params: NOTHING,
    query: z.strictObject({ profileId: ID }),
    body: NO_BODY,
    response: PHONE_CONTEXT,
  }),
  readPhoneDetail: endpoint({
    method: 'GET',
    path: '/api/phones/:deviceId/detail',
    access: 'member',
    summary:
      'The latest detail a phone reported (power, sound, screen, network, connections, storage, apps, notifications, alarm), cut down to what the caller may see of that phone; sections names the ones wanted (all when left out)',
    params: z.strictObject({ deviceId: ID }),
    query: z.strictObject({ sections: queryList(z.enum(PHONE_DETAIL_SECTION_NAMES)).optional() }),
    body: NO_BODY,
    response: PHONE_DETAIL,
  }),
  uploadPhoneIcon: endpoint({
    method: 'POST',
    path: '/api/phone-icons',
    access: 'member',
    summary: 'A phone uploads the icon of one of its apps once per icon (WebP, keyed by its hash)',
    params: NOTHING,
    query: NOTHING,
    body: PHONE_ICON_UPLOAD,
    response: DONE,
  }),
  readPhoneIcon: endpoint({
    method: 'GET',
    path: '/api/phone-icons/:hash',
    access: 'member',
    summary: 'The WebP icon of a phone app by its hash',
    params: z.strictObject({ hash: PHONE_ICON_HASH }),
    query: NOTHING,
    body: NO_BODY,
    response: PHONE_ICON_UPLOAD,
  }),
};
