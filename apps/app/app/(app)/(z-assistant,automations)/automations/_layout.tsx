import type { ReactNode } from 'react';
import { AutomationsLayoutHost } from '../../../../src/features/automations/hosts/list-hosts';

export const unstable_settings = { initialRouteName: 'index' };

export { RouteErrorBoundary as ErrorBoundary } from '../../../../src/app-shell/route-error-boundary';

export default function AutomationsGroupLayout(): ReactNode {
  return <AutomationsLayoutHost />;
}
