import type { AppPlugin } from '../contract';
import { DISCORD_PLUGIN } from './discord-data';
import { DISCORD_WIDGETS } from './discord-widgets';
import { DiscordStatusSection } from './status-section';

export const discordAppPlugin: AppPlugin = {
  id: DISCORD_PLUGIN,
  widgets: DISCORD_WIDGETS,
  deviceSections: [],
  deviceSettings: [],
  settings: () => <DiscordStatusSection />,
};
