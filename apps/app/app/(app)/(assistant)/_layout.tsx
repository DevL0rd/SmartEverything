import type { ReactNode } from 'react';
import { TabStack } from '../../../src/app-shell/tab-stack';

export { RouteErrorBoundary as ErrorBoundary } from '../../../src/app-shell/route-error-boundary';

export const unstable_settings = { initialRouteName: 'assistant/index' };

export default function GroupLayout(): ReactNode {
  return <TabStack />;
}
