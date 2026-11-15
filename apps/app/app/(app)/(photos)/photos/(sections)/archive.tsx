import type { ReactNode } from 'react';
import { ArchiveScreen } from '../../../../../src/features/photos/organise';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <ArchiveScreen />;
}
