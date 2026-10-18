import { useEffect } from 'react';
import { useIsFocused } from 'expo-router';
import type { AiChatRow } from '@smarteverything/domain';
import { connectionState } from '../../../../api/connection/connection';
import { useValue } from '../../../../design/external-store';
import { useSession } from '../../../../store/selectors';
import { setLocalPref } from '../../../../store/local-prefs';
import type { BrowserTabs } from '../browser-tabs';
import { EmbeddedBrowserChannel } from './embedded-browser-channel';
export function useEmbeddedBrowserController(
  chat: AiChatRow,
  tabs: BrowserTabs,
  active: boolean,
): void {
  const state = useValue(connectionState);
  const connection = state.status === 'paired' ? state.connection : null;
  const focused = useIsFocused();
  const { client } = useSession();
  useEffect(() => {
    if (!focused || !active || client.profile_id !== chat.profile_id || connection === null)
      return undefined;
    const channel = new EmbeddedBrowserChannel(
      connection,
      { viewerId: tabs.viewerId, clientId: client.id, profileId: chat.profile_id, chatId: chat.id },
      tabs,
      (): void => {
        setLocalPref('chatPanelOpen', true);
      },
    );
    return (): void => {
      channel.dispose();
    };
  }, [connection, focused, active, client.id, client.profile_id, chat.id, chat.profile_id, tabs]);
}
