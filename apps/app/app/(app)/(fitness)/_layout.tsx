import type { ReactNode } from 'react';
import { Stack } from 'expo-router';
import { TabStack } from '../../../src/app-shell/tab-stack';

export { RouteErrorBoundary as ErrorBoundary } from '../../../src/app-shell/route-error-boundary';

export const unstable_settings = { initialRouteName: 'fitness/(sections)' };

export default function GroupLayout(): ReactNode {
  return (
    <TabStack initialRouteName={unstable_settings.initialRouteName}>
      <Stack.Screen name="fitness/(sections)" dangerouslySingular />
    </TabStack>
  );
}
