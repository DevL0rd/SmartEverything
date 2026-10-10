import type { ReactNode } from 'react';
import { Stack } from 'expo-router';
import { ShellGate } from '../../src/app-shell/shell-gate';
import { isNative } from '../../src/design/platform';

export { RouteErrorBoundary as ErrorBoundary } from '../../src/app-shell/route-error-boundary';

export default function FlowsLayout(): ReactNode {
  return (
    <ShellGate>
      <Stack
        screenOptions={{
          headerShown: false,
          presentation: isNative() ? 'card' : 'transparentModal',
          contentStyle: isNative() ? undefined : { backgroundColor: 'transparent' },
        }}
      />
    </ShellGate>
  );
}
