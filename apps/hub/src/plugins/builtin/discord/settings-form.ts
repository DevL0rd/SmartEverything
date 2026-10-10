import type { PluginManifestInput } from '@smarteverything/domain';
import { SNOWFLAKE_PATTERN } from './ids';
import { TOKEN_SECRET } from './settings';
import { VOICE_SETTINGS_FORM } from './voice/settings-form';

type Form = NonNullable<NonNullable<PluginManifestInput['contributes']>['settings']>;

const ID_ITEM = { pattern: SNOWFLAKE_PATTERN, maxLength: 20 } as const;

const MODE_OPTIONS = [
  { value: 'blocklist', label: 'All but blocked' },
  { value: 'allowlist', label: 'Only allowed' },
] as const;

const CAPTURE_OPTIONS = [
  { value: 'all', label: 'Everything' },
  { value: 'addressed', label: 'Meant for the bot' },
] as const;

export const DISCORD_SETTINGS_FORM: Form = {
  [TOKEN_SECRET]: {
    type: 'string',
    title: 'Bot token',
    description: 'From the Bot page of your app in the Discord Developer Portal.',
    secret: true,
    humanOnly: true,
    group: 'Connection',
  },
  message_content_intent: {
    type: 'boolean',
    title: 'Read message text',
    description:
      'Needs Message Content Intent switched on in the Discord Developer Portal. Without it the bot cannot see what people write in servers.',
    default: true,
    group: 'Connection',
  },
  guild_members_intent: {
    type: 'boolean',
    title: 'See server members',
    description: 'Needs Server Members Intent switched on in the Discord Developer Portal.',
    default: true,
    group: 'Connection',
  },
  approved_roles: {
    type: 'list',
    title: 'Approved roles',
    description:
      'Anyone holding one of these Discord roles may talk to the bot. Add single people on the People page.',
    humanOnly: true,
    item: ID_ITEM,
    picker: 'roles',
    maxItems: 100,
    group: 'Who may use the bot',
  },
  servers_mode: {
    type: 'enum',
    title: 'Server rule',
    options: [...MODE_OPTIONS],
    default: 'blocklist',
    group: 'Servers and channels',
  },
  servers_allowed: {
    type: 'list',
    title: 'Allowed servers',
    description: 'Pick the servers. Used when it works only in the allowed ones.',
    item: ID_ITEM,
    picker: 'servers',
    maxItems: 100,
    group: 'Servers and channels',
  },
  servers_blocked: {
    type: 'list',
    title: 'Blocked servers',
    description: 'Pick the servers it never works in. Blocked always wins.',
    item: ID_ITEM,
    picker: 'servers',
    maxItems: 100,
    group: 'Servers and channels',
  },
  channels_mode: {
    type: 'enum',
    title: 'Channel rule',
    options: [...MODE_OPTIONS],
    default: 'blocklist',
    group: 'Servers and channels',
  },
  channels_allowed: {
    type: 'list',
    title: 'Allowed channels',
    description: 'Pick channels or threads. Threads follow their parent channel.',
    item: ID_ITEM,
    picker: 'channels',
    maxItems: 1000,
    group: 'Servers and channels',
  },
  channels_blocked: {
    type: 'list',
    title: 'Blocked channels',
    description: 'Pick the channels or threads it never works in. Blocked always wins.',
    item: ID_ITEM,
    picker: 'channels',
    maxItems: 1000,
    group: 'Servers and channels',
  },
  reply_to_bot: {
    type: 'boolean',
    title: 'Answer replies to the bot',
    description: 'A reply to one of the bot’s own messages counts as talking to it.',
    default: true,
    group: 'When it answers',
  },
  match_names: {
    type: 'boolean',
    title: 'Answer when its name is written',
    description:
      'Its Discord name, its server nicknames and the names below count. Needs Read message text.',
    default: true,
    group: 'When it answers',
  },
  names: {
    type: 'list',
    title: 'Other names',
    description:
      'Extra names it answers to, 2 to 32 letters each, up to 10. In a voice call they, its Discord name and the assistant’s name work as wake words said anywhere in a sentence.',
    item: { maxLength: 32 },
    maxItems: 10,
    group: 'When it answers',
  },
  activity_visibility: {
    type: 'boolean',
    title: 'Show working steps',
    description:
      'While the AI works, a short status line under the request shows the latest step. It disappears when the answer arrives.',
    default: true,
    live: true,
    group: 'When it answers',
  },
  context_enabled: {
    type: 'boolean',
    title: 'Remember recent messages',
    description: 'Keeps recent channel messages so the AI can read what was said before.',
    default: true,
    group: 'Recent messages',
  },
  context_capture: {
    type: 'enum',
    title: 'Messages to remember',
    options: [...CAPTURE_OPTIONS],
    default: 'all',
    group: 'Recent messages',
  },
  context_reach: {
    type: 'enum',
    title: 'History shown to the AI',
    options: [
      { value: 'server', label: 'Whole server' },
      { value: 'channel', label: 'Channel only' },
    ],
    default: 'server',
    group: 'Recent messages',
  },
  context_per_channel: {
    type: 'number',
    title: 'Messages kept per channel',
    minimum: 1,
    maximum: 100,
    default: 50,
    group: 'Recent messages',
  },
  context_include_bots: {
    type: 'boolean',
    title: 'Include other bots',
    default: true,
    group: 'Recent messages',
  },
  media_enabled: {
    type: 'boolean',
    title: 'Attachments',
    description: 'Lets the AI find and read pictures and files people posted.',
    default: true,
    group: 'Attachments',
  },
  media_capture: {
    type: 'enum',
    title: 'Attachments to remember',
    options: [...CAPTURE_OPTIONS],
    default: 'all',
    group: 'Attachments',
  },
  media_max_attachments: {
    type: 'number',
    title: 'Attachments remembered',
    minimum: 1,
    maximum: 1000,
    default: 500,
    group: 'Attachments',
  },
  media_ttl_minutes: {
    type: 'number',
    title: 'Minutes an attachment is remembered',
    minimum: 1,
    maximum: 60,
    default: 30,
    group: 'Attachments',
  },
  media_max_file_bytes: {
    type: 'number',
    title: 'Largest file in bytes',
    description: 'The default 2097152 is 2 MiB; the most allowed is 8388608.',
    minimum: 1,
    maximum: 8388608,
    default: 2097152,
    group: 'Attachments',
  },
  ...VOICE_SETTINGS_FORM,
};
