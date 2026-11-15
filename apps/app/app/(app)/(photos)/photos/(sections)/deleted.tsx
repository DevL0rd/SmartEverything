import type { ReactNode } from 'react';
import { DeletedScreen } from '../../../../../src/features/photos/deleted';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <DeletedScreen />;
}
