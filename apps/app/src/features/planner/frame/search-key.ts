import { router } from 'expo-router';
import { useEffect, useEffectEvent } from 'react';
import { href } from '../../../app-shell/hrefs';
import type { ShellAction } from '../../../components/page-shell/shell-actions';
import { isNative } from '../../../design/platform';
import { opensSearch, pageKeysHeld } from './quick-add';

export const PLANNER_SEARCH_ACTION: ShellAction = {
  icon: 'search',
  label: 'Search the Planner',
  href: href.planner.search(),
  shortcut: '/',
  iconOnly: true,
};

export function withPlannerSearch(
  actions: readonly ShellAction[],
  shellSearch: boolean,
): readonly ShellAction[] {
  return shellSearch ? actions : [...actions, PLANNER_SEARCH_ACTION];
}

export function usePlannerSearchKey(active: boolean): void {
  const open = useEffectEvent((event: KeyboardEvent): void => {
    if (event.defaultPrevented || !opensSearch(event, pageKeysHeld(event.target))) return;
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
