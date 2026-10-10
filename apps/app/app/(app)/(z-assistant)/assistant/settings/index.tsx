import type { ReactNode } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OldAssistantSettingsRoute(): ReactNode {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: '/settings/assistant', params }} />;
}
