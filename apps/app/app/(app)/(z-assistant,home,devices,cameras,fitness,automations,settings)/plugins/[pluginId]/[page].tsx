import type { ReactNode } from 'react';
import { useLocalSearchParams } from 'expo-router';
import { ExtensionPageScreen } from '../../../../../src/plugins/declared/extension-page-screen';

export default function PluginExtensionPageRoute(): ReactNode {
  const { pluginId, page } = useLocalSearchParams<{ pluginId: string; page: string }>();
  return <ExtensionPageScreen key={`${pluginId}/${page}`} pluginId={pluginId} pageId={page} />;
}
