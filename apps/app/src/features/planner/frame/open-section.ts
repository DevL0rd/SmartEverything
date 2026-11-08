import type { NavigationAction } from 'expo-router/react-navigation';
import type { AppHref } from '../../../components/app-href';
import type { PlannerSection } from '../model/section-routes';
import { plannerSectionOf } from './sections';

interface SectionNavigation {
  readonly getState: () => { readonly type: string; readonly key: string } | undefined;
  readonly dispatch: (action: NavigationAction) => void;
}

export interface PlannerRouter {
  readonly navigate: (target: AppHref) => void;
}

export interface OpenPlannerSection {
  readonly section: PlannerSection;
  readonly active: PlannerSection;
  readonly navigation: SectionNavigation;
  readonly router: PlannerRouter;
}

export function openPlannerSection({
  section,
  active,
  navigation,
  router,
}: OpenPlannerSection): void {
  if (section === active) return;
  const sections = navigation.getState();
  if (sections?.type === 'tab') {
    navigation.dispatch({ type: 'NAVIGATE', payload: { name: section }, target: sections.key });
    return;
  }
  router.navigate(plannerSectionOf(section).href);
}
