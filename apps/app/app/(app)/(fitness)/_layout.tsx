import type { ReactNode } from 'react';
import { TabStack } from '../../../src/app-shell/tab-stack';
import { FitnessSetupScreen, useFitnessReady } from '../../../src/features/profiles';

export { RouteErrorBoundary as ErrorBoundary } from '../../../src/app-shell/route-error-boundary';

export const unstable_settings = { initialRouteName: 'fitness/index' };

export default function GroupLayout(): ReactNode {
  return useFitnessReady() ? <TabStack /> : <FitnessSetupScreen />;
}
