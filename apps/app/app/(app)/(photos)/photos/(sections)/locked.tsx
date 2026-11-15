import type { ReactNode } from 'react';
import { LockedScreen } from '../../../../../src/features/photos/organise';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <LockedScreen />;
}
