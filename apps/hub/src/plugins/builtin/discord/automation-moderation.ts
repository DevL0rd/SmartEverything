import { actionNode, entity, input, ports } from '../automation-kit';
import { CHANNEL, MESSAGE, PERSON, SERVER } from './automation-entities';
import {
  DELETE_MESSAGE_TOOL,
  KICK_BAN_TOOL,
  PIN_TOOL,
  ROLE_ADD_TOOL,
  ROLE_REMOVE_TOOL,
  TIMEOUT_MAX_SECONDS,
  TIMEOUT_TOOL,
} from './automation-more-tools';

const COMMAND_TIMEOUT = { default: 30_000, max: 120_000 } as const;

export const ROLE = entity('discord', {
  id: 'role',
  title: 'Discord role',
  plural: 'Discord roles',
  options: 'roles',
});

const SERVER_PORT = input(SERVER.kind, {
  title: 'Server',
  description: 'The Discord server the person is in.',
});

const PERSON_PORT = input(PERSON.kind, {
  title: 'Person',
  description: 'The person in that server.',
});

const KICK_BAN_CHOICES = [
  { id: 'member_kick', label: 'Kick out of the server' },
  { id: 'member_ban', label: 'Ban from the server' },
] as const;

const ROLE_PORT = input(ROLE.kind, { title: 'Role', description: 'The role.' });

const REASON_PORT = input(ports.text(), {
  title: 'Reason',
  description: 'Why. Discord keeps it in the server audit log.',
});

const CHANNEL_PORT = input(CHANNEL.kind, {
  title: 'Channel',
  description: 'The channel the message is in.',
});

const MESSAGE_PORT = input(MESSAGE.kind, {
  title: 'Message',
  description: 'The message, from a trigger or from sending a message.',
});

export const ROLE_ADD_NODE = actionNode({
  id: 'role_add',
  version: 1,
  title: 'Give a Discord role',
  description: 'Gives a person a role in a Discord server.',
  icon: 'shield',
  keywords: ['discord', 'role', 'give', 'add', 'member', 'permission'],
  summary: 'Give {person} the role {role} in {server}',
  tool: ROLE_ADD_TOOL,
  inputs: { server: SERVER_PORT, person: PERSON_PORT, role: ROLE_PORT },
  args: {
    action: { lit: 'member_role_add' },
    guildId: { port: 'server' },
    userId: { port: 'person' },
    roleId: { port: 'role' },
  },
  access: 'owner',
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const ROLE_REMOVE_NODE = actionNode({
  id: 'role_remove',
  version: 1,
  title: 'Take away a Discord role',
  description: 'Takes a role away from a person in a Discord server.',
  icon: 'shield',
  keywords: ['discord', 'role', 'take', 'remove', 'member', 'permission'],
  summary: 'Take the role {role} from {person} in {server}',
  tool: ROLE_REMOVE_TOOL,
  inputs: { server: SERVER_PORT, person: PERSON_PORT, role: ROLE_PORT },
  args: {
    action: { lit: 'member_role_remove' },
    guildId: { port: 'server' },
    userId: { port: 'person' },
    roleId: { port: 'role' },
  },
  access: 'owner',
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const TIMEOUT_NODE = actionNode({
  id: 'timeout',
  version: 1,
  title: 'Time out a Discord member',
  description:
    'Stops a person from writing and speaking in a Discord server for a while. Zero seconds ends a timeout early. Discord allows up to 28 days.',
  icon: 'timer',
  keywords: ['discord', 'timeout', 'mute', 'silence', 'member', 'moderation'],
  summary: 'Time out {person} in {server} for {seconds} seconds',
  tool: TIMEOUT_TOOL,
  inputs: {
    server: SERVER_PORT,
    person: PERSON_PORT,
    seconds: input(
      ports.number({ integer: true, min: 0, max: TIMEOUT_MAX_SECONDS, unit: 'seconds' }),
      {
        title: 'For how long',
        description: 'How long the timeout lasts, in seconds. Zero ends a timeout.',
        ui: { min: 0, max: TIMEOUT_MAX_SECONDS, step: 1, unit: 'seconds' },
      },
    ),
    reason: REASON_PORT,
  },
  args: {
    action: { lit: 'member_timeout' },
    guildId: { port: 'server' },
    userId: { port: 'person' },
    durationSeconds: { port: 'seconds' },
    reason: { port: 'reason' },
  },
  access: 'owner',
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const KICK_BAN_NODE = actionNode({
  id: 'kick_ban',
  version: 1,
  title: 'Kick or ban a Discord member',
  description:
    'Removes a person from a Discord server. A kick lets them come back with a new invite; a ban does not. No message is sent to them.',
  icon: 'ban',
  keywords: ['discord', 'kick', 'ban', 'remove', 'member', 'moderation'],
  summary: '{what} {person} in {server}',
  tool: KICK_BAN_TOOL,
  inputs: {
    what: input(ports.choice(KICK_BAN_CHOICES), {
      title: 'What to do',
      description: 'Kick or ban.',
    }),
    server: SERVER_PORT,
    person: PERSON_PORT,
    reason: REASON_PORT,
  },
  args: {
    action: { port: 'what' },
    guildId: { port: 'server' },
    userId: { port: 'person' },
    reason: { port: 'reason' },
  },
  access: 'owner',
  timeout: COMMAND_TIMEOUT,
});

export const DELETE_MESSAGE_NODE = actionNode({
  id: 'delete_message',
  version: 1,
  title: 'Delete a Discord message',
  description: 'Deletes one message from a Discord channel.',
  icon: 'trash',
  keywords: ['discord', 'delete', 'remove', 'message', 'moderation'],
  summary: 'Delete {message} in {channel}',
  tool: DELETE_MESSAGE_TOOL,
  inputs: { channel: CHANNEL_PORT, message: MESSAGE_PORT },
  args: {
    action: { lit: 'message_delete' },
    channelId: { port: 'channel' },
    messageId: { port: 'message' },
  },
  access: 'owner',
  timeout: COMMAND_TIMEOUT,
});

export const PIN_NODE = actionNode({
  id: 'pin',
  version: 1,
  title: 'Pin a Discord message',
  description: 'Pins a message at the top of its Discord channel.',
  icon: 'mapPin',
  keywords: ['discord', 'pin', 'message', 'keep'],
  summary: 'Pin {message} in {channel}',
  tool: PIN_TOOL,
  inputs: { channel: CHANNEL_PORT, message: MESSAGE_PORT },
  args: {
    action: { lit: 'message_pin' },
    channelId: { port: 'channel' },
    messageId: { port: 'message' },
  },
  retry: 'idempotent',
  timeout: COMMAND_TIMEOUT,
});

export const MODERATION_NODES = [
  ROLE_ADD_NODE,
  ROLE_REMOVE_NODE,
  TIMEOUT_NODE,
  KICK_BAN_NODE,
  DELETE_MESSAGE_NODE,
  PIN_NODE,
] as const;
