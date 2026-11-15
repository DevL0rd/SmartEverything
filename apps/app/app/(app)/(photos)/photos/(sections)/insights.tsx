import type { ReactNode } from 'react';
import { InsightsScreen } from '../../../../../src/features/photos/insights';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <InsightsScreen />;
}
