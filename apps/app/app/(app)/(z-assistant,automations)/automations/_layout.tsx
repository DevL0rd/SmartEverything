import type { ReactNode } from 'react';
import { AutomationsLayout } from '../../../../src/features/automations/screens/automations-layout';

export const unstable_settings = { initialRouteName: 'index' };

export { RouteErrorBoundary as ErrorBoundary } from '../../../../src/app-shell/route-error-boundary';

export default function AutomationsGroupLayout(): ReactNode {
  return <AutomationsLayout />;
}
