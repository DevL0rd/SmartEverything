import type { ReactNode } from 'react';
import { ViewerScreen } from '../../../../../src/features/photos/viewer';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <ViewerScreen />;
}
