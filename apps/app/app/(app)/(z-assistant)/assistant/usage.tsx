import type { ReactNode } from 'react';
import { Redirect } from 'expo-router';
import { href } from '../../../../src/app-shell/hrefs';

export default function OldUsageRoute(): ReactNode {
  return <Redirect href={href.assistantCosts()} />;
}
