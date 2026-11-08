import { entity } from '../automation-kit';

const PLUGIN = 'discord';

export const CHANNEL = entity(PLUGIN, {
  id: 'channel',
  title: 'Discord channel',
  plural: 'Discord channels',
  options: 'channels',
});

export const PERSON = entity(PLUGIN, {
  id: 'person',
  title: 'Discord person',
  plural: 'Discord people',
  options: 'people',
});

export const VOICE_CHANNEL = entity(PLUGIN, {
  id: 'voice_channel',
  title: 'Discord voice channel',
  plural: 'Discord voice channels',
  options: 'voice_channels',
});

export const SERVER = entity(PLUGIN, {
  id: 'server',
  title: 'Discord server',
  plural: 'Discord servers',
  options: 'servers',
});

export const MESSAGE = entity(PLUGIN, {
  id: 'message',
  title: 'Discord message',
  plural: 'Discord messages',
  options: 'messages',
});

export const EMOJI = entity(PLUGIN, {
  id: 'emoji',
  title: 'Emoji',
  plural: 'Emoji',
  options: 'emojis',
});

export const DISCORD_ENTITIES = [CHANNEL, PERSON, VOICE_CHANNEL, SERVER, MESSAGE, EMOJI] as const;
