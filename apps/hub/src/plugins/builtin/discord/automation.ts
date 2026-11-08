import { z } from 'zod';
import { actionNode, automation, input, optionalInput, output, ports } from '../automation-kit';
import {
  CHANNEL,
  DISCORD_ENTITIES,
  EMOJI,
  MESSAGE,
  PERSON,
  SERVER,
  VOICE_CHANNEL,
} from './automation-entities';
import { DISCORD_MORE_ENTITIES, DISCORD_MORE_NODES } from './automation-more';
import { DISCORD_TRIGGERS } from './automation-triggers';
import { SNOWFLAKE } from './ids';

const COMMAND_TIMEOUT = { default: 30_000, max: 120_000 } as const;

const UPLOAD_TIMEOUT = { default: 60_000, max: 300_000 } as const;

const SEND = {
  name: 'send',
  input: z.strictObject({
    channelId: SNOWFLAKE.optional(),
    userId: z.string().min(1).optional(),
    content: z.string().optional(),
    picture: z.string().min(1).optional(),
    pictures: z.array(z.string().min(1)).optional(),
  }),
};

const CHANGE = {
  name: 'change',
  input: z.strictObject({
    action: z.literal('reaction_add'),
    channelId: SNOWFLAKE,
    messageId: SNOWFLAKE,
    emoji: z.string().min(1),
  }),
};

const VOICE_JOIN = {
  name: 'voice',
  input: z.strictObject({ action: z.literal('join'), channelId: SNOWFLAKE }),
};

const VOICE_LEAVE = {
  name: 'voice',
  input: z.strictObject({ action: z.literal('leave'), guildId: SNOWFLAKE.optional() }),
};

const VOICE_MUTE = {
  name: 'voice',
  input: z.strictObject({
    action: z.literal('mute'),
    guildId: SNOWFLAKE.optional(),
  }),
};

const VOICE_UNMUTE = {
  name: 'voice',
  input: z.strictObject({
    action: z.literal('unmute'),
    guildId: SNOWFLAKE.optional(),
  }),
};

const VOICE_SPEAK = {
  name: 'voice',
  input: z.strictObject({
    action: z.literal('speak'),
    text: z.string().min(1),
    guildId: SNOWFLAKE.optional(),
  }),
};

export const SEND_NODE = actionNode({
  id: 'send',
  version: 1,
  title: 'Send a Discord message',
  description:
    'Posts a message in a Discord channel or sends it to one person as a direct message. Pictures from a camera snapshot or a made picture go along when you give their ids.',
  icon: 'messageCircle',
  keywords: ['discord', 'message', 'post', 'dm', 'picture', 'image', 'photo', 'chat'],
  summary: 'Send {text} to {channel} {person}',
  tool: SEND,
  inputs: {
    channel: optionalInput(CHANNEL.kind, {
      title: 'Channel',
      description: 'The channel to post in. Choose a channel or a person, not both.',
    }),
    person: optionalInput(PERSON.kind, {
      title: 'Person',
      description: 'The person to message directly. Choose a channel or a person, not both.',
    }),
    text: optionalInput(ports.text(), {
      title: 'Message',
      description: 'What to say. Optional when pictures are sent.',
    }),
    picture: optionalInput(ports.text(), {
      title: 'Picture',
      description:
        'One picture to attach, by its picture id from Camera picture or Make a picture.',
    }),
    pictures: optionalInput(ports.list(ports.text()), {
      title: 'More pictures',
      description: 'Several pictures to attach, each by its picture id.',
    }),
  },
  outputs: {
    message: output(MESSAGE.kind, {
      title: 'Message',
      description: 'The message that was posted.',
      from: '/result/id',
    }),
    posted_in: output(CHANNEL.kind, {
      title: 'Posted in',
      description: 'The channel the message went to, also for a direct message.',
      from: '/result/channel_id',
    }),
  },
  args: {
    channelId: { port: 'channel' },
    userId: { port: 'person' },
    content: { port: 'text' },
    picture: { port: 'picture' },
    pictures: { port: 'pictures' },
  },
  timeout: UPLOAD_TIMEOUT,
  waitOnly: ['message', 'posted_in'],
});

export const REACT_NODE = actionNode({
  id: 'react',
  version: 1,
  title: 'React to a Discord message',
  description: 'Adds an emoji reaction to a message.',
  icon: 'smile',
  keywords: ['discord', 'reaction', 'emoji', 'react'],
  summary: 'React {emoji} to {message}',
  tool: CHANGE,
  inputs: {
    channel: input(CHANNEL.kind, {
      title: 'Channel',
      description: 'The channel the message is in.',
    }),
    message: input(MESSAGE.kind, {
      title: 'Message',
      description: 'The message to react to, from a trigger or from sending a message.',
    }),
    emoji: input(EMOJI.kind, { title: 'Emoji', description: 'The emoji to react with.' }),
  },
  args: {
    action: { lit: 'reaction_add' },
    channelId: { port: 'channel' },
    messageId: { port: 'message' },
    emoji: { port: 'emoji' },
  },
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const VOICE_JOIN_NODE = actionNode({
  id: 'voice_join',
  version: 1,
  title: 'Join a Discord voice channel',
  description: 'The assistant joins a voice channel and writes down what everyone says.',
  icon: 'mic',
  keywords: ['discord', 'voice', 'call', 'join', 'channel'],
  summary: 'Join {channel}',
  tool: VOICE_JOIN,
  inputs: {
    channel: input(VOICE_CHANNEL.kind, {
      title: 'Voice channel',
      description: 'The voice channel to join.',
    }),
  },
  args: { action: { lit: 'join' }, channelId: { port: 'channel' } },
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const VOICE_LEAVE_NODE = actionNode({
  id: 'voice_leave',
  version: 1,
  title: 'Leave a Discord voice call',
  description: 'The assistant leaves its voice call and finishes the transcript.',
  icon: 'micOff',
  keywords: ['discord', 'voice', 'call', 'leave', 'hang up'],
  summary: 'Leave the call in {server}',
  tool: VOICE_LEAVE,
  inputs: {
    server: optionalInput(SERVER.kind, {
      title: 'Server',
      description: 'The server whose call to leave. The only active call when left out.',
    }),
  },
  args: { action: { lit: 'leave' }, guildId: { port: 'server' } },
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const VOICE_SPEAK_NODE = actionNode({
  id: 'voice_speak',
  version: 1,
  title: 'Speak in a Discord voice call',
  description:
    'The assistant says something in a voice call it is in, in its own words. While it is muted the words are only typed in the call chat.',
  icon: 'volume2',
  keywords: ['discord', 'voice', 'call', 'speak', 'say', 'announce'],
  summary: 'Say {text} in the call in {server}',
  tool: VOICE_SPEAK,
  inputs: {
    text: input(ports.text(), { title: 'Words', description: 'What to say.' }),
    server: optionalInput(SERVER.kind, {
      title: 'Server',
      description: 'The server whose call to speak in. The only active call when left out.',
    }),
  },
  args: { action: { lit: 'speak' }, text: { port: 'text' }, guildId: { port: 'server' } },
  timeout: COMMAND_TIMEOUT,
});

export const VOICE_MUTE_NODE = actionNode({
  id: 'voice_mute',
  version: 1,
  title: 'Mute in a Discord voice call',
  description:
    'The assistant stops talking in its voice call and stops writing down what it hears. Words it would say are only typed in the call chat.',
  icon: 'micOff',
  keywords: ['discord', 'voice', 'call', 'mute', 'silence', 'quiet'],
  summary: 'Mute the call in {server}',
  tool: VOICE_MUTE,
  inputs: {
    server: optionalInput(SERVER.kind, {
      title: 'Server',
      description: 'The server whose call to mute. The only active call when left out.',
    }),
  },
  args: { action: { lit: 'mute' }, guildId: { port: 'server' } },
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const VOICE_UNMUTE_NODE = actionNode({
  id: 'voice_unmute',
  version: 1,
  title: 'Unmute in a Discord voice call',
  description: 'The assistant may talk in its voice call again.',
  icon: 'mic',
  keywords: ['discord', 'voice', 'call', 'unmute', 'talk'],
  summary: 'Unmute the call in {server}',
  tool: VOICE_UNMUTE,
  inputs: {
    server: optionalInput(SERVER.kind, {
      title: 'Server',
      description: 'The server whose call to unmute. The only active call when left out.',
    }),
  },
  args: { action: { lit: 'unmute' }, guildId: { port: 'server' } },
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const DISCORD_NODES = [
  SEND_NODE,
  REACT_NODE,
  VOICE_JOIN_NODE,
  VOICE_LEAVE_NODE,
  VOICE_SPEAK_NODE,
  VOICE_MUTE_NODE,
  VOICE_UNMUTE_NODE,
] as const;

export const DISCORD_AUTOMATION = automation({
  nodes: [...DISCORD_NODES, ...DISCORD_MORE_NODES],
  triggers: [...DISCORD_TRIGGERS],
  entities: [...DISCORD_ENTITIES, ...DISCORD_MORE_ENTITIES],
  autoTriggers: false,
});
