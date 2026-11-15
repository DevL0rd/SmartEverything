import type { ReactNode } from 'react';
import { SectionTabs } from '../../../../../src/app-shell/section-tabs';
import { PHOTOS_SECTION_ROUTES } from '../../../../../src/features/photos/model/section-routes';

export { PhotosErrorBoundary as ErrorBoundary } from '../../../../../src/features/photos/components/photos-error-boundary';

export const unstable_settings = { initialRouteName: 'index' };

export default function SectionsLayout(): ReactNode {
  return <SectionTabs sections={PHOTOS_SECTION_ROUTES} />;
}
