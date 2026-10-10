import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { PluginPeopleScreen } from '../../../../../../src/features/plugins';

export default function PluginPeopleRoute(): ReactNode {
  const { pluginId } = useLocalSearchParams<{ pluginId: string }>();
  return <PluginPeopleScreen pluginId={pluginId} />;
}
