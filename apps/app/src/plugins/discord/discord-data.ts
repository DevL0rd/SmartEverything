import { DISCORD_STATUS, DISCORD_STREAM, type DiscordStatus } from '@smarteverything/domain';
import type { BadgeTone } from '../../components/badge';
import { usePluginStream, type PluginStream } from '../shared/use-plugin-stream';

export const DISCORD_PLUGIN = 'discord';

export function useDiscordStatus(): PluginStream<DiscordStatus> {
  return usePluginStream(DISCORD_PLUGIN, DISCORD_STREAM, DISCORD_STATUS);
}

export const GATEWAY_TEXT: Readonly<
  Record<DiscordStatus['gateway'], { readonly title: string; readonly tone: BadgeTone }>
> = {
  ready: { title: 'Connected', tone: 'positive' },
  connecting: { title: 'Connecting…', tone: 'info' },
  reconnecting: { title: 'Reconnecting…', tone: 'warning' },
  disconnected: { title: 'Disconnected', tone: 'warning' },
  error: { title: 'Problem', tone: 'critical' },
  offline: { title: 'Stopped', tone: 'neutral' },
};
