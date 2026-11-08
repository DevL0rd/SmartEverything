import type { ReactNode } from 'react';
import { SectionTabs } from '../../../../../src/app-shell/section-tabs';
import { DRIVE_SECTION_ROUTES } from '../../../../../src/features/drive/model/section-routes';

export { RouteErrorBoundary as ErrorBoundary } from '../../../../../src/app-shell/route-error-boundary';

export const unstable_settings = { initialRouteName: 'index' };

export default function SectionsLayout(): ReactNode {
  return <SectionTabs sections={DRIVE_SECTION_ROUTES} />;
}
