import type { ReactNode } from 'react';
import type { ErrorBoundaryProps } from 'expo-router';
import { AreaRouteErrorBoundary } from '../../../app-shell/route-error-boundary';

export function PhotosErrorBoundary(props: ErrorBoundaryProps): ReactNode {
  return <AreaRouteErrorBoundary title="Photos" {...props} />;
}
