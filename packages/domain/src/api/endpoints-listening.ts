import { z } from 'zod';
import {
  LISTENING_CLAIM_ANSWER,
  LISTENING_CONFIG,
  LISTENING_LEVEL_WATCH,
  LISTENING_PHONE_REPORT,
  LISTENING_SOURCE,
  LISTENING_SOURCE_CHANGE,
  LISTENING_VIEW,
  LISTENING_WAKE_CLAIM,
  WAKE_TEST_WATCH,
} from '../listening';
import { NO_BODY, endpoint } from './endpoint';
import { DONE, NOTHING } from './primitives';

export const LISTENING_ENDPOINTS = {
  readListening: endpoint({
    method: 'GET',
    path: '/api/listening',
    access: 'member',
    summary:
      'Every device that can listen for the AI’s name and write down what it hears: whether it does, its state, sensitivity, its last wake claims, and who answered the latest wake. Owners see everything; members see only their own phones and computers',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: LISTENING_VIEW,
  }),
  updateListeningSource: endpoint({
    method: 'PATCH',
    path: '/api/listening/sources/:sourceKey',
    access: 'member',
    summary:
      'Switch one device’s wake word listening or writing down on or off, change how readily it hears the name, or set when a phone may listen (always, only with the screen on, only while charging, only away from home) (sourceKey from read_listening); phones start with listening off; owners change any camera, phone or computer, members only their own phone or computer',
    params: z.strictObject({ sourceKey: z.string().min(1) }),
    query: NOTHING,
    body: LISTENING_SOURCE_CHANGE,
    response: LISTENING_SOURCE,
  }),
  watchListeningLevel: endpoint({
    method: 'PUT',
    path: '/api/listening/level',
    access: 'member',
    summary:
      'Start or stop the live loudness meter of one listening source for this app; one source at a time',
    params: NOTHING,
    query: NOTHING,
    body: LISTENING_LEVEL_WATCH,
    response: DONE,
  }),
  watchWakeTest: endpoint({
    method: 'PUT',
    path: '/api/listening/wake-test',
    access: 'owner',
    summary:
      'Start or stop the wake word test for this app: while on, the ears write down what they hear and send each line as a wake_test_heard notice, tagged as a match, a near miss or plain speech',
    params: NOTHING,
    query: NOTHING,
    body: WAKE_TEST_WATCH,
    response: DONE,
  }),
  readPhoneListeningConfig: endpoint({
    method: 'GET',
    path: '/api/listening/phone/config',
    access: 'member',
    summary:
      'What this phone’s ear should do now: whether it listens for the name or writes down speech, the hub’s keyword lines and thresholds; the app asks when it starts, and later changes arrive as listening_ear notices',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: LISTENING_CONFIG,
  }),
  claimPhoneWake: endpoint({
    method: 'POST',
    path: '/api/listening/phone/claims',
    access: 'member',
    summary:
      'This phone heard the AI’s name on the home network; the hub answers whether the phone answers it, or whether a louder phone, camera or computer, a walkie-talkie channel or Discord has it',
    params: NOTHING,
    query: NOTHING,
    body: LISTENING_WAKE_CLAIM,
    response: LISTENING_CLAIM_ANSWER,
  }),
  reportPhoneListening: endpoint({
    method: 'POST',
    path: '/api/listening/phone/reports',
    access: 'member',
    summary:
      'This phone’s ear reports a speech segment to write down, its microphone level while the Listening page meters it, or its state (in a conversation, or missing the microphone permission)',
    params: NOTHING,
    query: NOTHING,
    body: LISTENING_PHONE_REPORT,
    response: DONE,
  }),
} as const;
