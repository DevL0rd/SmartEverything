import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PluginScreen } from '../../../../../../src/features/plugins';

export default function PluginRoute(): ReactNode {
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  return <PluginScreen pluginId={pluginId} />;
}
