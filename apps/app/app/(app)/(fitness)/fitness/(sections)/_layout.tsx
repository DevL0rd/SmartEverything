import type { ReactNode } from 'react';
import { SectionTabs } from '../../../../../src/app-shell/section-tabs';
import { FITNESS_SECTION_ROUTES } from '../../../../../src/features/fitness/model/section-routes';

export { RouteErrorBoundary as ErrorBoundary } from '../../../../../src/app-shell/route-error-boundary';

export const unstable_settings = { initialRouteName: 'index' };

export default function SectionsLayout(): ReactNode {
  return <SectionTabs sections={FITNESS_SECTION_ROUTES} />;
}
