import { useEffect, useState } from 'react';
import { useIsFocused } from 'expo-router';
import { randomUUID } from 'expo-crypto';
import type { AiChatRow } from '@smarteverything/domain';
import { connectionState } from '../../../../api/connection/connection';
import { useServerEmbeddedBrowser } from '../../../../api/connection/server-capabilities';
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
  const connection = useValue(connectionState);
  const focused = useIsFocused();
  const { client } = useSession();
  const [viewerId] = useState(randomUUID);
  const supported = useServerEmbeddedBrowser(
    connection.status === 'paired' ? connection.connection.url : null,
  );
  useEffect(() => {
    if (
      !focused ||
      !active ||
      client.profile_id !== chat.profile_id ||
      connection.status !== 'paired' ||
      !supported
    )
      return undefined;
    const channel = new EmbeddedBrowserChannel(
      connection.connection,
      { viewerId, clientId: client.id, profileId: chat.profile_id, chatId: chat.id },
      tabs,
      (): void => {
        setLocalPref('chatPanelOpen', true);
      },
    );
    return (): void => {
      channel.dispose();
    };
  }, [
    connection,
    focused,
    active,
    client.id,
    client.profile_id,
    chat.id,
    chat.profile_id,
    viewerId,
    tabs,
    supported,
  ]);
}
