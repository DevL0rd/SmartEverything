import type { ReactNode } from 'react';
import { EditorScreen } from '../../../../../../src/features/photos/editor';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../../src/features/photos/components/photos-error-boundary';

export default function Route(): ReactNode {
  return <EditorScreen />;
}
