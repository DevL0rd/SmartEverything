import type { AppPlugin } from '../contract';
import { DISCORD_PLUGIN } from './discord-data';
import { DISCORD_WIDGETS } from './discord-widgets';
import { CALL_TRANSCRIPTS } from './call-rows';
import { DiscordStatusSection } from './status-section';

export const discordAppPlugin: AppPlugin = {
  id: DISCORD_PLUGIN,
  widgets: DISCORD_WIDGETS,
  widgetAliases: { 'discord.call': 'discord-call' },
  deviceSections: [],
  deviceSettings: [],
  settingsSearch: [
    {
      id: CALL_TRANSCRIPTS,
      title: 'Call transcripts',
      keywords: ['voice', 'history', 'search', 'speech', 'transcription'],
    },
  ],
  settings: () => <DiscordStatusSection />,
};
