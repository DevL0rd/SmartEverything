import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import { mainPageSettings } from '../../../app-shell/main-pages';
import type { AppHref } from '../../../components/app-href';
import type { IconName } from '../../../components/icon';
import type { MenuItem } from '../../../components/menu';
import { showPlannerPerson, type PersonChoice } from './person';
import { PLANNER_SECTION_DEFS } from './sections';

export interface PlannerMenuInput {
  readonly people: readonly PersonChoice[];
  readonly sections: boolean;
  readonly googleNeedsAttention: boolean;
}

function link(id: string, label: string, icon: IconName, target: AppHref): MenuItem {
  return {
    id,
    label,
    icon,
    onPress: (): void => {
      router.push(target);
    },
  };
}

const MENU_SECTIONS: readonly MenuItem[] = PLANNER_SECTION_DEFS.filter((def) => !def.phoneTab).map(
  (def) => link(def.id, def.label, def.icon, def.href),
);

function personItem(choice: PersonChoice): MenuItem {
  return {
    id: `person-${choice.person ?? 'me'}`,
    label: choice.shown ? `Showing: ${choice.name}` : `Show ${choice.name}`,
    icon: choice.shown ? 'check' : 'user',
    disabled: choice.shown,
    onPress: (): void => {
      showPlannerPerson(choice.person);
    },
  };
}

export function plannerMenu({
  people,
  sections,
  googleNeedsAttention,
}: PlannerMenuInput): readonly MenuItem[] {
  const settings = mainPageSettings('planner');
  return [
    ...people.map(personItem),
    ...(sections ? MENU_SECTIONS : []),
    ...(googleNeedsAttention
      ? [
          link(
            'google',
            'Google needs attention',
            'warning',
            href.settings.page('connections/google'),
          ),
        ]
      : []),
    link('settings', settings.label, 'settings', settings.href),
  ];
}
