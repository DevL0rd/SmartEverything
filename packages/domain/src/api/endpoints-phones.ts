import { z } from 'zod';
import {
  PHONE_ACTION,
  PHONE_ACTION_ANSWER,
  PHONE_ACTION_RESULT,
  PHONE_CONTEXT,
  PHONE_REPORT,
} from '../phones';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, ID, NOTHING } from './primitives';

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
      'Ask a phone to ring until stopped (find my phone: maximum volume even on silent, with a Stop notification; ring on:false stops it), turn its flashlight on, off or toggle, change a volume, the ringer or Do Not Disturb, control what it plays, show a link to open, or send a fresh report; waits for the phone to answer',
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
};
