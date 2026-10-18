import type { NavigationAction } from 'expo-router/react-navigation';
import { href } from '../../../app-shell/hrefs';
import { sectionRouteOf, type FitnessTab } from '../model/section-routes';

interface SectionNavigation {
  readonly getState: () => { readonly type: string; readonly key: string } | undefined;
  readonly dispatch: (action: NavigationAction) => void;
}

export interface SectionRouter {
  readonly push: (target: ReturnType<typeof href.fitnessPage>) => void;
  readonly replace: (target: ReturnType<typeof href.fitnessPage>) => void;
  readonly dismissTo: (target: ReturnType<typeof href.fitness>) => void;
}

export interface OpenSection {
  readonly tab: FitnessTab;
  readonly active: FitnessTab;
  readonly navigation: SectionNavigation;
  readonly router: SectionRouter;
}

export function openSection({ tab, active, navigation, router }: OpenSection): void {
  if (tab === active) {
    return;
  }
  const sections = navigation.getState();
  if (sections?.type === 'tab') {
    navigation.dispatch({
      type: 'NAVIGATE',
      payload: { name: sectionRouteOf(tab) },
      target: sections.key,
    });
    return;
  }
  if (tab === 'today') {
    router.dismissTo(href.fitness());
    return;
  }
  if (active === 'today') {
    router.push(href.fitnessPage(tab));
    return;
  }
  router.replace(href.fitnessPage(tab));
}
