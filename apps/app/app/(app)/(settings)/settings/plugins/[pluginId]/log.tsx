import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PluginLogScreen } from '../../../../../../src/features/plugins';

export default function PluginLogRoute(): ReactNode {
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  return <PluginLogScreen pluginId={pluginId} />;
}
