import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';

export default function OldAssistantsRoute(): ReactNode {
  return <Redirect href="/settings/assistant/integrations/tools" />;
}
