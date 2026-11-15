import type { ReactNode } from 'react';
import { RankingScreen } from '../../../../../src/features/photos/insights/ranking-screen';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <RankingScreen />;
}
