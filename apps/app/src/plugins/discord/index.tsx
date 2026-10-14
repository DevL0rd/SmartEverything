import type { AppPlugin } from '../contract';
import { DISCORD_PLUGIN } from './discord-data';
import { DISCORD_WIDGETS } from './discord-widgets';
import { DiscordStatusSection } from './status-section';

export const discordAppPlugin: AppPlugin = {
  id: DISCORD_PLUGIN,
  widgets: DISCORD_WIDGETS,
  deviceSections: [],
  deviceSettings: [],
  settingsSearch: [
    {
      id: 'call-transcripts',
      title: 'Call transcripts',
      focus: 'call-transcripts',
      keywords: ['voice', 'history', 'search', 'speech', 'transcription'],
    },
  ],
  settings: () => <DiscordStatusSection />,
};
