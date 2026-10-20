import { useMemo } from 'react';
import { usePathname } from 'expo-router';
import { useUnreadChatCount } from '../features/assistant';
import { useLocalPref } from '../store/local-prefs';
import { useAvailability } from '../store/selectors';
import { useNavigation } from './nav-layout';
import { navModel, type NavModel } from './nav-model';
import { leafKeyOfPath } from './nav-targets';
import type { TabKey } from './route-types';

export function useNavModel(current: TabKey): NavModel {
  const { resolved, facts } = useNavigation();
  const availability = useAvailability();
  const unread = useUnreadChatCount();
  const openFolders = useLocalPref('navFoldersOpen');
  const pathname = usePathname();
  const leaf = facts.size === 0 ? '' : leafKeyOfPath(pathname);
  return useMemo(
    () => navModel({ resolved, facts, availability, unread, current, leaf, openFolders }),
    [resolved, facts, availability, unread, current, leaf, openFolders],
  );
}
