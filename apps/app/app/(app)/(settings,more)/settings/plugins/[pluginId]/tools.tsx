import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PluginToolsScreen } from '../../../../../../src/features/plugins';

export default function PluginToolsRoute(): ReactNode {
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  return <PluginToolsScreen pluginId={pluginId} />;
}
