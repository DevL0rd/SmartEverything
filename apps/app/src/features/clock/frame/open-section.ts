import type { NavigationAction } from 'expo-router/react-navigation';
import type { AppHref } from '../../../components/app-href';
import type { ClockSection } from '../model/section-routes';
import { clockSectionOf } from './sections';

interface SectionNavigation {
  readonly getState: () => { readonly type: string; readonly key: string } | undefined;
  readonly dispatch: (action: NavigationAction) => void;
}

export interface ClockRouter {
  readonly navigate: (target: AppHref) => void;
}

export interface OpenClockSection {
  readonly section: ClockSection;
  readonly active: ClockSection;
  readonly navigation: SectionNavigation;
  readonly router: ClockRouter;
}

export function openClockSection({ section, active, navigation, router }: OpenClockSection): void {
  if (section === active) return;
  const sections = navigation.getState();
  if (sections?.type === 'tab') {
    navigation.dispatch({ type: 'NAVIGATE', payload: { name: section }, target: sections.key });
    return;
  }
  router.navigate(clockSectionOf(section).href);
}
