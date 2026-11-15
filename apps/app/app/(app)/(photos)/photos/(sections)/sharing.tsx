import type { ReactNode } from 'react';
import { SharingScreen } from '../../../../../src/features/photos/sharing';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <SharingScreen />;
}
