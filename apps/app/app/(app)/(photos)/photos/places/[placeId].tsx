import type { ReactNode } from 'react';
import { PlaceScreen } from '../../../../../src/features/photos/places';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <PlaceScreen />;
}
