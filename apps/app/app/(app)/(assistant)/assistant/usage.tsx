import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';

export default function OldUsageRoute(): ReactNode {
  return <Redirect href="/assistant/costs" />;
}
