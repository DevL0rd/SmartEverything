import { router } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { HeaderAction } from '../../../components/page-header';
import { isNative } from '../../../design/platform';
import { isTextEntry, opensSearch } from './quick-add';

export const PLANNER_SEARCH_ACTION: HeaderAction = {
  icon: 'search',
  label: 'Search the Planner',
  href: href.planner.search(),
  shortcut: '/',
  iconOnly: true,
};

export function usePlannerSearchKey(active: boolean): void {
  const open = useEffectEvent((event: KeyboardEvent): void => {
    if (event.defaultPrevented || !opensSearch(event, isTextEntry(event.target))) return;
    event.preventDefault();
    router.push(href.planner.search());
  });
  useEffect(() => {
    if (!active || isNative()) return undefined;
    document.addEventListener('keydown', open);
    return (): void => {
      document.removeEventListener('keydown', open);
    };
  }, [active]);
}
