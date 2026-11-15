import { router } from 'expo-router';
import { href } from '../../../app-shell/hrefs';
import type { AppHref } from '../../../components/app-href';
import type { IconName } from '../../../components/icon';
import type { MenuItem } from '../../../components/menu';
import { showPlannerPerson, type PersonChoice } from './person';

export interface PlannerMenuInput {
  readonly people: readonly PersonChoice[];
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

const PEOPLE_GROUP = 'Show the planner of';

export function personChoiceItem(choice: PersonChoice): MenuItem {
  return {
    id: `person-${choice.person ?? 'me'}`,
    label: choice.name,
    icon: 'user',
    selected: choice.shown,
    onPress: (): void => {
      showPlannerPerson(choice.person);
    },
  };
}

function personItem(choice: PersonChoice): MenuItem {
  return { ...personChoiceItem(choice), group: PEOPLE_GROUP };
}

export function plannerMenu({
  people,
  googleNeedsAttention,
}: PlannerMenuInput): readonly MenuItem[] {
  return [
    ...people.map(personItem),
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
  ];
}
