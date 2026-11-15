import type { ReactNode } from 'react';
import { FolderScreen } from '../../../../../src/features/photos/folders';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <FolderScreen />;
}
