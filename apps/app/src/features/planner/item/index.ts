import type { PlannerItemRow } from '@smarteverything/domain';
import { createElement, type ReactNode } from 'react';
import { EmptyState } from '../../../components/empty-state';
import { PageHeader } from '../../../components/page-header';
import { Screen, type ScreenProps } from '../../../components/screen';
import { usePlannerItems } from '../data';
import { usePlannerShownPerson } from '../frame/person';

export { Composer, type ComposerProps } from './composer';
export { COMPOSER_KINDS, type ComposerKind } from './parse-preview';

export function itemIn(items: readonly PlannerItemRow[], itemId: string): PlannerItemRow | null {
  return items.find((item) => item.id === itemId && item.deleted_at === null) ?? null;
}

function bodyOf(item: PlannerItemRow | null): ReactNode {
  return item === null
    ? createElement(EmptyState, {
        icon: 'calendar',
        title: 'This item is gone',
        body: 'It was deleted, or it belongs to someone else.',
      })
    : createElement(EmptyState, {
        icon: item.kind === 'event' ? 'calendar' : 'circleCheck',
        title: item.title,
        body: item.notes === '' ? 'Details and actions show here.' : item.notes,
      });
}

export function ItemScreen({ itemId }: { readonly itemId: string }): ReactNode {
  const item = itemIn(usePlannerItems(usePlannerShownPerson()), itemId);
  const props: ScreenProps = {
    maxWidth: 'reading',
    children: bodyOf(item),
    header: createElement(PageHeader, {
      title: item === null ? 'Planner item' : item.title,
      overflow: [],
    }),
  };
  return createElement(Screen, props);
}
