import { DISCORD_STREAM, type PluginManifestInput } from '@smarteverything/domain';
import type { BuiltinPlugin } from '../contract';
import { figureWidget } from '../board-widget';
import { defineBuiltinPlugin } from '../define';
import { startDiscord, type DiscordEnvironment } from './runtime';
import { DISCORD_SETTINGS } from './settings';
import { DISCORD_SETTINGS_FORM } from './settings-form';

const DISCORD_MANIFEST: PluginManifestInput = {
  id: 'discord',
  name: 'Discord',
  version: '1.0.0',
  description:
    'Talk to your assistant from Discord: it answers approved people in servers and direct messages, joins voice calls to write them down and talk, reads recent messages and attachments, and can manage servers.',
  publisher: 'SmartEverything',
  icon: 'messageCircle',
  permissions: { inbound: true, network: true, files: 'own', voice: true },
  contributes: {
    data: [
      {
        stream: DISCORD_STREAM,
        title: 'Discord connection',
        schema: { type: 'object' },
        history: 0,
      },
    ],
    widgets: [figureWidget('discord.call', 'Discord call', 'mic', DISCORD_STREAM)],
    settings: DISCORD_SETTINGS_FORM,
    peoplePicker: 'people',
  },
};

export function createDiscordPlugin(environment: DiscordEnvironment): BuiltinPlugin {
  return defineBuiltinPlugin({
    manifest: DISCORD_MANIFEST,
    settings: DISCORD_SETTINGS,
    start: (ctx) => startDiscord(ctx, environment),
  });
}
