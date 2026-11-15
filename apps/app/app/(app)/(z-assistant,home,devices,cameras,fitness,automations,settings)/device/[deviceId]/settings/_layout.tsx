import type { ReactNode } from 'react';
import { DeviceSettingsLayout } from '../../../../../../src/features/device-list';

export { RouteErrorBoundary as ErrorBoundary } from '../../../../../../src/app-shell/route-error-boundary';

export default function DeviceSettingsGroupLayout(): ReactNode {
  return <DeviceSettingsLayout />;
}
