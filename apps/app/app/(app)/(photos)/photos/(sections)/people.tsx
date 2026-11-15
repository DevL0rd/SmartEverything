import type { ReactNode } from 'react';
import { PeopleScreen } from '../../../../../src/features/photos/people';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <PeopleScreen />;
}
