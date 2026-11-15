import type { ReactNode } from 'react';
import { AlbumScreen } from '../../../../../src/features/photos/albums';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <AlbumScreen />;
}
