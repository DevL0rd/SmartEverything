import { z } from 'zod';
import { SNOWFLAKE } from './ids';

export const TIMEOUT_MAX_SECONDS = 28 * 86_400;

export const POLL_HOURS_MAX = 768;

export const MESSAGES_MAX = 100;

export const KICK_BAN_ACTIONS = ['member_kick', 'member_ban'] as const;

const PERSON_REF = z.string().min(1);

const REASON = z.string().min(1).max(300);

export const ASK_TOOL = {
  name: 'prompt',
  input: z.strictObject({
    channelId: SNOWFLAKE.optional(),
    userId: PERSON_REF.optional(),
    content: z.string().min(1).max(2000),
    mode: z.literal('buttons'),
    answers: z.array(z.string().min(1).max(80)).min(1).max(5),
  }),
};

export const LATEST_TOOL = {
  name: 'read',
  input: z.strictObject({
    action: z.literal('messages_list'),
    channelId: SNOWFLAKE,
    limit: z.number().int().min(1).max(MESSAGES_MAX).optional(),
  }),
};

export const ROLE_ADD_TOOL = {
  name: 'change',
  input: z.strictObject({
    action: z.literal('member_role_add'),
    guildId: SNOWFLAKE,
    userId: PERSON_REF,
    roleId: SNOWFLAKE,
  }),
};

export const ROLE_REMOVE_TOOL = {
  name: 'remove',
  input: z.strictObject({
    action: z.literal('member_role_remove'),
    guildId: SNOWFLAKE,
    userId: PERSON_REF,
    roleId: SNOWFLAKE,
  }),
};

export const TIMEOUT_TOOL = {
  name: 'remove',
  input: z.strictObject({
    action: z.literal('member_timeout'),
    guildId: SNOWFLAKE,
    userId: PERSON_REF,
    durationSeconds: z.number().int().min(0).max(TIMEOUT_MAX_SECONDS),
    reason: REASON,
  }),
};

export const KICK_BAN_TOOL = {
  name: 'remove',
  input: z.strictObject({
    action: z.enum(KICK_BAN_ACTIONS),
    guildId: SNOWFLAKE,
    userId: PERSON_REF,
    reason: REASON,
  }),
};

export const PIN_TOOL = {
  name: 'change',
  input: z.strictObject({
    action: z.literal('message_pin'),
    channelId: SNOWFLAKE,
    messageId: SNOWFLAKE,
  }),
};

export const DELETE_MESSAGE_TOOL = {
  name: 'remove',
  input: z.strictObject({
    action: z.literal('message_delete'),
    channelId: SNOWFLAKE,
    messageId: SNOWFLAKE,
  }),
};

export const POLL_TOOL = {
  name: 'change',
  input: z.strictObject({
    action: z.literal('poll_create'),
    channelId: SNOWFLAKE,
    poll: z.strictObject({
      question: z.string().min(1).max(300),
      answers: z.array(z.string().min(1).max(55)).min(2).max(10),
      durationHours: z.number().int().min(1).max(POLL_HOURS_MAX).optional(),
      multiselect: z.boolean().optional(),
    }),
  }),
};

export const EVENT_TOOL = {
  name: 'change',
  input: z.strictObject({
    action: z.literal('scheduled_event_create'),
    guildId: SNOWFLAKE,
    name: z.string().min(1).max(100),
    description: z.string().max(1000).optional(),
    start: z.iso.datetime(),
    end: z.iso.datetime(),
    location: z.string().min(1).max(100),
  }),
};
