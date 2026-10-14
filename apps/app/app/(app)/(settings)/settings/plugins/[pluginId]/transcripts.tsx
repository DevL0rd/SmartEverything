import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { DiscordTranscriptScreen } from '../../../../../../src/plugins/discord/transcript-screen';

export default function PluginTranscriptRoute(): ReactNode {
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  return <DiscordTranscriptScreen pluginId={pluginId} />;
}
