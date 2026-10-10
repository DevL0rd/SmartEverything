import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PluginListScreen } from '../../../../../../../src/features/plugins';

export default function PluginListRoute(): ReactNode {
  const { pluginId, setting } = useLocalSearchParams<{ pluginId: string; setting: string }>();
  return <PluginListScreen pluginId={pluginId} setting={setting} />;
}
