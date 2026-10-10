import { z } from 'zod';
import { DiscordInputError } from '../errors';
import { NO_MENTIONS } from '../outgoing';
import {
  channel,
  define,
  fetchMessage,
  forwardPagination,
  message,
  pagination,
  query,
  text,
  type Operation,
  ON_CHANNEL,
} from './kit';

const CUSTOM_EMOJI = /^[a-zA-Z0-9_]{2,32}:\d{17,20}$/;
const UNICODE_EMOJI =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|[0-9#*]️?⃣)(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|‍|️|⃣)*$/u;

const emoji = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => CUSTOM_EMOJI.test(value) || UNICODE_EMOJI.test(value), 'Not an emoji');

const poll = z.strictObject({
  question: z.string().min(1).max(300),
  answers: z.array(z.string().min(1).max(55)).min(2).max(10),
  durationHours: z.number().int().min(1).max(768).default(24),
  multiselect: z.boolean().default(false),
});

const PIN_LIMIT = 50;

const reactionRoute = (channelId: string, messageId: string, name: string): string =>
  `/channels/${channelId}/messages/${messageId}/reactions/${encodeURIComponent(name)}/@me`;

export const MESSAGE_OPERATIONS: readonly Operation[] = [
  define(
    'read',
    {
      action: 'messages_list',
      description: 'Read a bounded page of channel history.',
      ...ON_CHANNEL,
    },
    { ...channel, ...pagination },
    (a, c) =>
      c.rest.get(`/channels/${a.channelId}/messages`, query({ limit: a.limit, before: a.before })),
  ),
  define(
    'read',
    { action: 'message_get', description: 'Read one message.', ...ON_CHANNEL },
    message,
    (a, c) => c.rest.get(`/channels/${a.channelId}/messages/${a.messageId}`),
  ),
  define(
    'read',
    { action: 'pins_list', description: 'Read a bounded page of pinned messages.', ...ON_CHANNEL },
    {
      ...channel,
      limit: z.number().int().min(1).max(PIN_LIMIT).default(25),
      before: z.iso.datetime().optional(),
    },
    (a, c) =>
      c.rest.get(
        `/channels/${a.channelId}/messages/pins`,
        query({ limit: a.limit, before: a.before }),
      ),
  ),
  define(
    'read',
    {
      action: 'reaction_users',
      description: 'Read a bounded page of users for one Unicode or name:id custom emoji reaction.',
      ...ON_CHANNEL,
    },
    { ...message, emoji, ...forwardPagination },
    (a, c) =>
      c.rest.get(
        `/channels/${a.channelId}/messages/${a.messageId}/reactions/${encodeURIComponent(a.emoji)}`,
        query({ limit: a.limit, after: a.after }),
      ),
  ),
  define(
    'read',
    {
      action: 'poll_voters',
      description: 'Read a bounded page of voters for one answer.',
      ...ON_CHANNEL,
    },
    { ...message, answerId: z.number().int().positive(), ...forwardPagination },
    (a, c) =>
      c.rest.get(
        `/channels/${a.channelId}/polls/${a.messageId}/answers/${String(a.answerId)}`,
        query({ limit: a.limit, after: a.after }),
      ),
  ),
  define(
    'change',
    {
      action: 'message_edit',
      description: 'Edit a message written by this bot. Mentions stay disabled.',
      ...ON_CHANNEL,
    },
    { ...message, content: text },
    async (a, c) => {
      const existing = await fetchMessage(c, a.channelId, a.messageId);
      if (existing.author.id !== c.botId) {
        throw new DiscordInputError('Only messages written by the bot can be edited');
      }
      return c.rest.patch(`/channels/${a.channelId}/messages/${a.messageId}`, {
        content: a.content,
        allowed_mentions: NO_MENTIONS,
      });
    },
  ),
  define(
    'change',
    {
      action: 'message_pin',
      description: 'Pin a message from an approved person or the bot.',
      ...ON_CHANNEL,
    },
    message,
    async (a, c) => {
      await fetchMessage(c, a.channelId, a.messageId);
      return c.rest.put(`/channels/${a.channelId}/messages/pins/${a.messageId}`);
    },
  ),
  define(
    'change',
    { action: 'reaction_add', description: 'Add a reaction to a message.', ...ON_CHANNEL },
    { ...message, emoji },
    async (a, c) => {
      await fetchMessage(c, a.channelId, a.messageId);
      return c.rest.put(reactionRoute(a.channelId, a.messageId, a.emoji));
    },
  ),
  define(
    'change',
    {
      action: 'poll_create',
      description: 'Create a poll in a channel.',
      ...ON_CHANNEL,
    },
    { ...channel, poll },
    (a, c) =>
      c.rest.post(`/channels/${a.channelId}/messages`, {
        allowed_mentions: NO_MENTIONS,
        poll: {
          question: { text: a.poll.question },
          answers: a.poll.answers.map((answer) => ({ poll_media: { text: answer } })),
          duration: a.poll.durationHours,
          allow_multiselect: a.poll.multiselect,
          layout_type: 1,
        },
      }),
  ),
  define(
    'remove',
    { action: 'message_delete', description: 'Delete one message.', ...ON_CHANNEL },
    message,
    (a, c) => c.rest.delete(`/channels/${a.channelId}/messages/${a.messageId}`),
  ),
  define(
    'remove',
    {
      action: 'messages_bulk_delete',
      description: 'Delete 2 to 100 messages newer than 14 days.',
      ...ON_CHANNEL,
    },
    { ...channel, messageIds: z.array(message.messageId).min(2).max(100) },
    (a, c) =>
      c.rest.post(`/channels/${a.channelId}/messages/bulk-delete`, { messages: a.messageIds }),
  ),
  define(
    'remove',
    { action: 'message_unpin', description: 'Unpin a message.', ...ON_CHANNEL },
    message,
    (a, c) => c.rest.delete(`/channels/${a.channelId}/messages/pins/${a.messageId}`),
  ),
  define(
    'remove',
    {
      action: 'reaction_remove_own',
      description: 'Remove only the bot’s own reaction.',
      ...ON_CHANNEL,
    },
    { ...message, emoji },
    (a, c) => c.rest.delete(reactionRoute(a.channelId, a.messageId, a.emoji)),
  ),
  define(
    'remove',
    { action: 'poll_end', description: 'End a poll written by the bot.', ...ON_CHANNEL },
    message,
    async (a, c) => {
      const existing = await fetchMessage(c, a.channelId, a.messageId);
      if (existing.author.id !== c.botId) {
        throw new DiscordInputError('Only polls written by the bot can be ended');
      }
      return c.rest.post(`/channels/${a.channelId}/polls/${a.messageId}/expire`, {});
    },
  ),
];
