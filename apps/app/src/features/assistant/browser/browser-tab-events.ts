import { browserTabOperation } from './browser-tab-operation';
import { usePausable } from '../../../design/external-store';
import { useEffect, useEffectEvent, useMemo } from 'react';
import { useIsFocused } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import type { ServerConnection } from '../../../api/connection/storage';
import { useValue } from '../../../design/external-store';
import { connectionState } from '../../../api/connection/connection';
import { useActiveProfile } from '../../../store/people';
import { useSession } from '../../../store/selectors';
import { browserWorkspace } from './browser-runtime';
import { browserTabsKey } from './browser-tab-persistence';
import { BrowserTabs } from './browser-tabs';
import { followRouteRecovery, recoverUnavailableTabs } from './browser-tab-recovery';
export function useBrowserTabs(
  chat: AiChatRow,
  active: boolean,
): {
  readonly tabs: BrowserTabs;
} {
  const profile = useActiveProfile();
  const focused = useIsFocused();
  const clientId = useSession().client.id;
  const connection = useValue(connectionState);
  const owner = connection.status === 'paired' ? connection.connection : null;
  const storageKey =
    owner === null ? null : browserTabsKey(owner.url, clientId, chat.profile_id, chat.id);
  const tabs = useMemo(
    () =>
      owner === null || storageKey === null
        ? new BrowserTabs(chat.id, chat.profile_id)
        : browserWorkspace(storageKey, {
            connection: owner,
            clientId,
            profileId: chat.profile_id,
            chatId: chat.id,
          }),
    [chat.id, chat.profile_id, owner, storageKey, clientId],
  );
  const profileMatches = profile?.id === chat.profile_id;
  const authorized = profileMatches && connection.status === 'paired';
  useStoredTabs(tabs, authorized ? active && focused : false);
  useTabAuthority(tabs, { profileMatches, connection });
  useRouteRecovery(tabs, profileMatches ? owner : null);
  return { tabs };
}
function useStoredTabs(tabs: BrowserTabs, opened: boolean): void {
  useEffect(() => {
    if (opened) tabs.loadSelected();
    return tabs.subscribe(() => {
      if (opened) tabs.loadSelected();
    });
  }, [tabs, opened]);
}
function useRouteRecovery(tabs: BrowserTabs, owner: ServerConnection | null): void {
  const recover = useEffectEvent((): void => {
    recoverUnavailableTabs(tabs);
  });
  useEffect(() => (owner === null ? undefined : followRouteRecovery(owner, recover)), [owner]);
}
function useTabAuthority(
  tabs: BrowserTabs,
  context: {
    readonly profileMatches: boolean;
    readonly connection: ReturnType<typeof connectionState.get>;
  },
): void {
  const { profileMatches, connection } = context;
  const snapshot = usePausable(tabs.subscribe, tabs.read);
  useEffect(() => {
    if (profileMatches && connection.status === 'paired') return;
    for (const tab of tabs.read().tabs) {
      if (tab.selection !== null || tab.phase === 'opening')
        browserTabOperation(
          tabs.unavailable(tab.id, 'This browser viewer’s profile or paired connection changed.'),
        );
    }
  }, [tabs, snapshot, profileMatches, connection]);
}
