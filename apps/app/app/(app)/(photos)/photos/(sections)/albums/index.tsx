import type { ReactNode } from 'react';
import { AlbumsScreen } from '../../../../../../src/features/photos/albums';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <AlbumsScreen />;
}
