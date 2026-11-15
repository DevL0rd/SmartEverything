import type { ReactNode } from 'react';
import { LibraryScreen } from '../../../../../src/features/photos/library/library-screen';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <LibraryScreen />;
}
