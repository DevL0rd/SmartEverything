import type { ReactNode } from 'react';
import { SettingsLayout } from '../../../../src/settings/settings-layout';

export const unstable_settings = { initialRouteName: 'index' };

export { RouteErrorBoundary as ErrorBoundary } from '../../../../src/app-shell/route-error-boundary';

export default function SettingsGroupLayout(): ReactNode {
  return <SettingsLayout />;
}
