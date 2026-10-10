import { z } from 'zod';
import {
  AI_OUTREACH_ROW,
  OUTREACH_REASON_MAX,
  REACH_PRESENCE,
  REACH_SETTINGS,
  REACH_SETTINGS_CHANGE,
} from '../reach';
import { NO_BODY, endpoint } from './endpoint';
import { ID, NOTHING, queryLimit } from './primitives';

const PERSON = ID.describe('The person: a profile id from list_people');

const REASON = z
  .string()
  .trim()
  .min(1)
  .max(OUTREACH_REASON_MAX)
  .describe('Why, in a sentence; the conversation opens with it');

const URGENT = z
  .boolean()
  .default(false)
  .describe('Urgent gets through the person’s quiet hours when they allow it');

export const CALL_PERSON = z.strictObject({
  personId: PERSON,
  device: z
    .enum(['phone', 'desktop', 'any'])
    .describe('Which of their apps ring: phone, desktop, or any of them; first answer wins'),
  reason: REASON,
  urgent: URGENT,
});

export type CallPerson = z.output<typeof CALL_PERSON>;

export const REACH_TARGET = z
  .discriminatedUnion('kind', [
    z.strictObject({
      kind: z.literal('device'),
      deviceId: ID.describe('A camera device id, or an app clientId from read_presence'),
    }),
    z.strictObject({
      kind: z.literal('channel'),
      channelId: ID.describe('A walkie-talkie channel id; every member hears it'),
    }),
  ])
  .describe('Where: one device only, or a whole walkie-talkie channel');

export type ReachTarget = z.output<typeof REACH_TARGET>;

export const SPEAK = z.strictObject({
  target: REACH_TARGET,
  text: z.string().trim().min(1).max(1000).describe('Exactly what to say, said once word for word'),
});

export type Speak = z.output<typeof SPEAK>;

export const START_CONVERSATION = z.strictObject({
  target: REACH_TARGET,
  reason: REASON,
  urgent: URGENT,
});

export type StartConversation = z.output<typeof START_CONVERSATION>;

export const NOTIFY_PERSON = z.strictObject({
  personId: PERSON,
  text: z.string().trim().min(1).max(2000).describe('The message'),
  urgent: URGENT,
});

export type NotifyPerson = z.output<typeof NOTIFY_PERSON>;

const OUTREACH_PARAMS = z.strictObject({ outreachId: ID });

const OUTREACH_QUERY = z.strictObject({
  personId: ID.optional().describe('Whose; yours when left out (owners can ask for anyone)'),
  limit: queryLimit(20, 100),
});

const PRESENCE_QUERY = z.strictObject({
  personId: ID.optional().describe('Whose presence; yours when left out'),
});

export const REACH_ENDPOINTS = {
  readPresence: endpoint({
    method: 'GET',
    path: '/api/reach/presence',
    access: 'member',
    summary:
      'Where a person can be reached right now: their apps (phone, desktop) and whether each is connected, the latest person or motion seen in the home, quiet hours, the cameras the AI may talk through, their walkie channels and any call already ringing or live',
    params: NOTHING,
    query: PRESENCE_QUERY,
    body: NO_BODY,
    response: REACH_PRESENCE,
  }),
  callPerson: endpoint({
    method: 'POST',
    path: '/api/reach/calls',
    access: 'member',
    summary:
      'Call a person: ring their phone, desktop or any app for a live voice conversation with you; first answer wins, it rings for 45 seconds, and the outcome (answered, declined, missed) comes back to this chat',
    params: NOTHING,
    query: NOTHING,
    body: CALL_PERSON,
    response: AI_OUTREACH_ROW,
  }),
  speak: endpoint({
    method: 'POST',
    path: '/api/reach/speak',
    access: 'member',
    summary:
      'Say something out loud once, exactly as written, on one camera speaker or to a whole walkie-talkie channel; nobody is listened to. For a back-and-forth use start_conversation',
    params: NOTHING,
    query: NOTHING,
    body: SPEAK,
    response: AI_OUTREACH_ROW,
  }),
  startConversation: endpoint({
    method: 'POST',
    path: '/api/reach/conversations',
    access: 'member',
    summary:
      'Start a live two-way voice conversation with you in this chat: through a camera (it follows and zooms on people), with a walkie-talkie channel, or by ringing one app; "talk to me from the living room camera" is this with that camera',
    params: NOTHING,
    query: NOTHING,
    body: START_CONVERSATION,
    response: AI_OUTREACH_ROW,
  }),
  notifyPerson: endpoint({
    method: 'POST',
    path: '/api/reach/notify',
    access: 'member',
    summary:
      'Send a person a message in their newest chat, which also notifies their phone; refused during their quiet hours unless urgent and they allow urgent',
    params: NOTHING,
    query: NOTHING,
    body: NOTIFY_PERSON,
    response: AI_OUTREACH_ROW,
  }),
  listOutreach: endpoint({
    method: 'GET',
    path: '/api/reach/outreach',
    access: 'member',
    summary:
      'Conversations, calls, things said and messages the AI started, newest first, with their state, id and how they ended',
    params: NOTHING,
    query: OUTREACH_QUERY,
    body: NO_BODY,
    response: z.array(AI_OUTREACH_ROW),
  }),
  endOutreach: endpoint({
    method: 'POST',
    path: '/api/reach/outreach/:outreachId/end',
    access: 'member',
    summary:
      'Hang up by id: stop a ringing call or end a live camera or channel conversation; an answered phone or desktop call ends from inside it',
    params: OUTREACH_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: AI_OUTREACH_ROW,
  }),
  declineOutreach: endpoint({
    method: 'POST',
    path: '/api/reach/outreach/:outreachId/decline',
    access: 'member',
    summary: 'Decline a ringing AI call on this device',
    params: OUTREACH_PARAMS,
    query: NOTHING,
    body: NOTHING.optional(),
    response: AI_OUTREACH_ROW,
  }),
  readReachSettings: endpoint({
    method: 'GET',
    path: '/api/reach/settings',
    access: 'member',
    summary:
      'Your rules for how the AI may reach you: quiet hours and the cameras it may talk through',
    params: NOTHING,
    query: NOTHING,
    body: NO_BODY,
    response: REACH_SETTINGS,
  }),
  updateReachSettings: endpoint({
    method: 'PATCH',
    path: '/api/reach/settings',
    access: 'member',
    summary:
      'Change your quiet hours; owners also choose which cameras the AI may talk through (every camera unless turned off; new cameras are allowed)',
    params: NOTHING,
    query: NOTHING,
    body: REACH_SETTINGS_CHANGE,
    response: REACH_SETTINGS,
  }),
} as const;
