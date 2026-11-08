import type { PluginEventKind } from '@smarteverything/domain';
import { eventTrigger, ports } from '../automation-kit';
import { DISCORD_EVENT_KINDS } from './automation-events';
import { CHANNEL, EMOJI, MESSAGE, PERSON, SERVER, VOICE_CHANNEL } from './automation-entities';

function eventOf(kind: string): PluginEventKind {
  const found = DISCORD_EVENT_KINDS.find((event) => event.kind === kind);
  if (found === undefined) {
    throw new Error(`the Discord event ${kind} is not declared`);
  }
  return found;
}

export const MESSAGE_RECEIVED_TRIGGER = eventTrigger({
  id: 'message_received',
  version: 1,
  title: 'A Discord message arrives',
  description:
    'Runs when someone writes a message in a channel the assistant can see. Test the text with an If step to react only to certain words.',
  icon: 'messageCircle',
  keywords: ['discord', 'message', 'received', 'chat', 'text'],
  summary: 'A message in {channel} from {person}',
  event: eventOf('message_received'),
  filters: {
    channel: {
      kind: CHANNEL.kind,
      title: 'Channel',
      description: 'Only messages in this channel.',
      match: 'channel',
    },
    person: {
      kind: PERSON.kind,
      title: 'Person',
      description: 'Only messages from this person.',
      match: 'author',
    },
  },
  outputs: {
    text: { kind: ports.text(), title: 'Text', from: 'text' },
    author: { kind: PERSON.kind, title: 'Author', from: 'author' },
    channel: { kind: CHANNEL.kind, title: 'Channel', from: 'channel' },
    message: { kind: MESSAGE.kind, title: 'Message', from: 'message' },
    hasAttachment: { kind: ports.boolean(), title: 'Has an attachment', from: 'has_attachment' },
  },
});

export const VOICE_JOINED_TRIGGER = eventTrigger({
  id: 'voice_joined',
  version: 1,
  title: 'Someone joins a Discord voice channel',
  description: 'Runs when a person joins a voice channel.',
  icon: 'mic',
  keywords: ['discord', 'voice', 'join', 'call'],
  summary: '{person} joins {channel}',
  event: eventOf('voice_joined'),
  filters: {
    channel: {
      kind: VOICE_CHANNEL.kind,
      title: 'Voice channel',
      description: 'Only this voice channel.',
      match: 'channel',
    },
    person: {
      kind: PERSON.kind,
      title: 'Person',
      description: 'Only this person.',
      match: 'person',
    },
  },
  outputs: {
    person: { kind: PERSON.kind, title: 'Person', from: 'person' },
    channel: { kind: VOICE_CHANNEL.kind, title: 'Voice channel', from: 'channel' },
  },
});

export const VOICE_LEFT_TRIGGER = eventTrigger({
  id: 'voice_left',
  version: 1,
  title: 'Someone leaves a Discord voice channel',
  description: 'Runs when a person leaves a voice channel.',
  icon: 'micOff',
  keywords: ['discord', 'voice', 'leave', 'call'],
  summary: '{person} leaves {channel}',
  event: eventOf('voice_left'),
  filters: {
    channel: {
      kind: VOICE_CHANNEL.kind,
      title: 'Voice channel',
      description: 'Only this voice channel.',
      match: 'channel',
    },
    person: {
      kind: PERSON.kind,
      title: 'Person',
      description: 'Only this person.',
      match: 'person',
    },
  },
  outputs: {
    person: { kind: PERSON.kind, title: 'Person', from: 'person' },
    channel: { kind: VOICE_CHANNEL.kind, title: 'Voice channel', from: 'channel' },
  },
});

export const REACTION_ADDED_TRIGGER = eventTrigger({
  id: 'reaction_added',
  version: 1,
  title: 'Someone reacts to a Discord message',
  description: 'Runs when a person adds an emoji reaction to a message.',
  icon: 'smile',
  keywords: ['discord', 'reaction', 'emoji', 'react'],
  summary: '{person} reacts {emoji} in {channel}',
  event: eventOf('reaction_added'),
  filters: {
    channel: {
      kind: CHANNEL.kind,
      title: 'Channel',
      description: 'Only reactions in this channel.',
      match: 'channel',
    },
    person: {
      kind: PERSON.kind,
      title: 'Person',
      description: 'Only reactions from this person.',
      match: 'person',
    },
    emoji: {
      kind: EMOJI.kind,
      title: 'Emoji',
      description: 'Only this emoji.',
      match: 'emoji',
    },
  },
  outputs: {
    emoji: { kind: EMOJI.kind, title: 'Emoji', from: 'emoji' },
    person: { kind: PERSON.kind, title: 'Person', from: 'person' },
    channel: { kind: CHANNEL.kind, title: 'Channel', from: 'channel' },
    message: { kind: MESSAGE.kind, title: 'Message', from: 'message' },
  },
});

export const MEMBER_JOINED_TRIGGER = eventTrigger({
  id: 'member_joined_server',
  version: 1,
  title: 'Someone joins a Discord server',
  description: 'Runs when a new member joins a server the assistant is in.',
  icon: 'userPlus',
  keywords: ['discord', 'member', 'join', 'server', 'new'],
  summary: 'Someone joins {server}',
  event: eventOf('member_joined_server'),
  filters: {
    server: {
      kind: SERVER.kind,
      title: 'Server',
      description: 'Only this server.',
      match: 'server',
    },
  },
  outputs: {
    person: { kind: PERSON.kind, title: 'Person', from: 'person' },
    server: { kind: SERVER.kind, title: 'Server', from: 'server' },
  },
});

export const DISCORD_TRIGGERS = [
  MESSAGE_RECEIVED_TRIGGER,
  VOICE_JOINED_TRIGGER,
  VOICE_LEFT_TRIGGER,
  REACTION_ADDED_TRIGGER,
  MEMBER_JOINED_TRIGGER,
] as const;
