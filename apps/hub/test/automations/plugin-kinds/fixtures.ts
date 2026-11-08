import { PLUGIN_MANIFEST, type FlowType, type PluginManifest } from '@smarteverything/domain';

export const CHANNEL: FlowType = { t: 'entity', of: 'chat-hub.channel' };
const TEXT: FlowType = { t: 'text' };

export const POST_NODE = {
  id: 'post_message',
  version: 1,
  title: 'Post a message',
  description: 'Posts a message to a channel.',
  icon: 'message',
  summary: 'Post {text} to {channel}',
  kind: 'action',
  inputs: [
    {
      name: 'channel',
      title: 'Channel',
      type: CHANNEL,
      required: true,
      description: 'Where.',
    },
    {
      name: 'text',
      title: 'Text',
      type: TEXT,
      required: false,
      default: 'Hello',
      description: 'What.',
      ui: { unit: 'words' },
    },
  ],
  outputs: [
    { name: 'messageId', title: 'Message', type: TEXT, description: 'The id.', from: '/id' },
  ],
  run: { tool: 'post', args: { channelId: { port: 'channel' }, body: { port: 'text' } } },
  timeout: { default: 10_000, max: 120_000 },
} as const;

export const POSTED_TRIGGER = {
  id: 'message_posted',
  version: 1,
  title: 'A message is posted',
  description: 'Fires on a new message.',
  icon: 'message',
  summary: 'A message in {channel}',
  event: 'message',
  filters: [
    {
      name: 'channel',
      title: 'Channel',
      type: CHANNEL,
      match: 'channel_id',
      description: 'Where.',
    },
  ],
  outputs: [{ name: 'author', title: 'Author', type: TEXT, from: 'author' }],
  timing: ['cooldown'],
} as const;

export const ONLINE_VALUE = {
  id: 'members_online',
  version: 1,
  title: 'Members online',
  description: 'Members online now.',
  icon: 'users',
  summary: 'Members online',
  from: { stream: 'members' },
  outputs: [{ name: 'count', type: { t: 'number' }, from: '/count' }],
} as const;

export function manifestWith(id: string, automation: Record<string, unknown>): PluginManifest {
  return PLUGIN_MANIFEST.parse({
    id,
    name: 'Chat hub',
    version: '1.2.0',
    description: 'A chat service.',
    publisher: 'Tests',
    contributes: {
      events: [{ kind: 'message', title: 'Message', fields: { channel_id: 'string' } }],
      data: [{ stream: 'members', title: 'Members', schema: { type: 'object' } }],
      automation: {
        entities: [{ id: 'channel', title: 'Channel', plural: 'Channels', options: 'channels' }],
        ...automation,
      },
    },
  });
}
