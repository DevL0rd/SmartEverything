import { z } from 'zod';
import {
  TALK_CHANNEL_NAME,
  TALK_CHANNEL_ROW,
  TALK_ICON,
  TALK_KEEP,
  TALK_MEMBER_KIND,
  TALK_MEMBER_ROW,
  TALK_MESSAGE_ROW,
  TALK_PRIORITY,
  TALK_STATUS,
} from '../talk';
import { NO_BODY, endpoint } from './endpoint';
import { MEDIA_LINK } from './endpoints-media';
import { DONE, ID, MOMENT, NOTHING, queryLimit, somethingToChange } from './primitives';

const CHANNEL_PARAMS = z.strictObject({ channelId: ID });

const MEMBER_PARAMS = z.strictObject({
  channelId: ID,
  memberKind: TALK_MEMBER_KIND,
  memberId: ID,
});

export const TALK_NEW_MEMBER = z.strictObject({
  member_kind: TALK_MEMBER_KIND,
  member_id: ID,
  listening: z.boolean().optional(),
});

export type TalkNewMember = z.infer<typeof TALK_NEW_MEMBER>;

export const TALK_NEW_CHANNEL = z.strictObject({
  name: TALK_CHANNEL_NAME,
  icon: TALK_ICON.default('radio'),
  priority: TALK_PRIORITY.default('normal'),
  keep_hours: TALK_KEEP.default(24),
  ai_listens: z.boolean().default(true),
  members: z.array(TALK_NEW_MEMBER).max(100).default([]),
});

export type TalkNewChannel = z.infer<typeof TALK_NEW_CHANNEL>;

export const TALK_CHANNEL_CHANGE = somethingToChange({
  name: TALK_CHANNEL_NAME,
  icon: TALK_ICON,
  priority: TALK_PRIORITY,
  keep_hours: TALK_KEEP,
  ai_listens: z.boolean(),
  position: z.int().min(0).max(1_000_000),
});

export type TalkChannelChange = z.infer<typeof TALK_CHANNEL_CHANGE>;

export const TALK_MESSAGE_LINK = MEDIA_LINK.extend({ id: ID });

export const TALK_AREA_ENDPOINTS = {
  readTalk: endpoint({
    method: 'GET',
    path: '/api/talk',
    access: 'member',
    summary:
      'Walkie-talkie channels, their members, who is talking now, which devices are online, and the latest messages with their transcripts for each channel (newest first, messages sets how many per channel, 0 for none)',
    params: NOTHING,
    query: z.strictObject({ messages: z.coerce.number().int().min(0).max(50).default(5) }),
    body: NO_BODY,
    response: TALK_STATUS,
  }),
  createTalkChannel: endpoint({
    method: 'POST',
    path: '/api/talk/channels',
    access: 'owner',
    summary:
      'Create a walkie-talkie channel, optionally with its first members; the AI listens to it unless ai_listens is false',
    params: NOTHING,
    query: NOTHING,
    body: TALK_NEW_CHANNEL,
    response: TALK_CHANNEL_ROW,
  }),
  updateTalkChannel: endpoint({
    method: 'PATCH',
    path: '/api/talk/channels/:channelId',
    access: 'owner',
    summary:
      'Rename a walkie-talkie channel or change its icon, priority, order, message keeping or whether the AI listens to it',
    params: CHANNEL_PARAMS,
    query: NOTHING,
    body: TALK_CHANNEL_CHANGE,
    response: TALK_CHANNEL_ROW,
  }),
  removeTalkChannel: endpoint({
    method: 'DELETE',
    path: '/api/talk/channels/:channelId',
    access: 'owner',
    summary: 'Delete a walkie-talkie channel with its members and saved messages',
    params: CHANNEL_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  setTalkMember: endpoint({
    method: 'PUT',
    path: '/api/talk/channels/:channelId/members/:memberKind/:memberId',
    access: 'member',
    summary:
      'Add a paired device or camera to a channel, or change whether it plays the channel; devices may change only themselves',
    params: MEMBER_PARAMS,
    query: NOTHING,
    body: z.strictObject({ listening: z.boolean() }),
    response: TALK_MEMBER_ROW,
  }),
  removeTalkMember: endpoint({
    method: 'DELETE',
    path: '/api/talk/channels/:channelId/members/:memberKind/:memberId',
    access: 'member',
    summary: 'Take a device or camera out of a channel; devices may remove only themselves',
    params: MEMBER_PARAMS,
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
  listTalkMessages: endpoint({
    method: 'GET',
    path: '/api/talk/messages',
    access: 'member',
    summary:
      'Recent walkie-talkie messages with their transcripts, newest first, optionally for one channel',
    params: NOTHING,
    query: z.strictObject({
      channelId: ID.optional(),
      before: MOMENT.optional(),
      limit: queryLimit(50, 200),
    }),
    body: NO_BODY,
    response: z.array(TALK_MESSAGE_ROW),
  }),
  talkMessageLinks: endpoint({
    method: 'POST',
    path: '/api/talk/messages/links',
    access: 'member',
    summary: 'Short-lived links to the saved audio (Ogg Opus) of walkie-talkie messages',
    params: NOTHING,
    query: NOTHING,
    body: z.strictObject({ ids: z.array(ID).min(1).max(50) }),
    response: z.array(TALK_MESSAGE_LINK),
  }),
  removeTalkMessage: endpoint({
    method: 'DELETE',
    path: '/api/talk/messages/:messageId',
    access: 'owner',
    summary: 'Delete one saved walkie-talkie message and its audio',
    params: z.strictObject({ messageId: ID }),
    query: NOTHING,
    body: NO_BODY,
    response: DONE,
  }),
} as const;
