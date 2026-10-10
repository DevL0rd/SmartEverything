import type { ReactNode } from 'react';
import { Redirect, useLocalSearchParams } from 'expo-router';

export default function OldAssistantSettingsPageRoute(): ReactNode {
  const { page, ...rest } = useLocalSearchParams<{ page: string[]; focus?: string }>();
  return (
    <Redirect
      href={{ pathname: '/settings/[...page]', params: { ...rest, page: ['assistant', ...page] } }}
    />
  );
}
