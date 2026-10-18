import { browserTabOperation } from './browser-tab-operation';
import { BrowserPublicationEvents } from './browser-publication-events';
import { usePausable } from '../../../design/external-store';
import { useEffect, useState, useEffectEvent, useMemo } from 'react';
import { useIsFocused } from 'expo-router';
import type { AiChatRow, AiPreviewCatalogue } from '@smarteverything/domain';
import type { ServerConnection } from '../../../api/connection/storage';
import { useValue } from '../../../design/external-store';
import { connectionState } from '../../../api/connection/connection';
import { useActiveProfile } from '../../../store/people';
import { useSession } from '../../../store/selectors';
import { browserWorkspace } from './browser-runtime';
import { browserTabsKey } from './browser-tab-persistence';
import { setLocalPref } from '../../../store/local-prefs';
import { previewNotices } from '../../../queries/preview-notices';
import { usePreviews } from '../data/previews';
import { browserPublications } from './browser-publications';
import { selectionState } from './browser-selection';
import { BrowserTabs } from './browser-tabs';
import { followRouteRecovery, recoverUnavailableTabs } from './browser-tab-recovery';
export function useBrowserTabs(
  chat: AiChatRow,
  active: boolean,
): {
  readonly tabs: BrowserTabs;
  readonly catalogue: ReturnType<typeof usePreviews>;
} {
  const catalogue = usePreviews(chat.id);
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
  useStoredTabs(tabs, authorized ? active && focused : false, catalogue.data);
  tabs.setCatalogue(catalogue.data);
  usePublicationEvents(tabs, catalogue.data, chat, { authorized, visible: active && focused });
  useTabAuthority(tabs, catalogue.data, {
    profileMatches,
    connection,
  });
  useRouteRecovery(tabs, catalogue.data, profileMatches ? owner : null);
  return { tabs, catalogue };
}
function useStoredTabs(
  tabs: BrowserTabs,
  opened: boolean,
  catalogue: AiPreviewCatalogue | undefined,
): void {
  useEffect(() => {
    if (opened) tabs.loadSelected();
    return tabs.subscribe(() => {
      if (opened) tabs.loadSelected();
    });
  }, [tabs, opened, catalogue]);
}
function usePublicationEvents(
  tabs: BrowserTabs,
  catalogue: AiPreviewCatalogue | undefined,
  chat: AiChatRow,
  activity: { readonly authorized: boolean; readonly visible: boolean },
): void {
  const { authorized, visible } = activity;
  const [events] = useState(() => new BrowserPublicationEvents());
  const pending = events.pending;
  const consume = useEffectEvent((): void => {
    if (authorized && visible) consumePublicationEvents(tabs, pending, catalogue);
  });
  useEffect(
    () =>
      previewNotices.subscribe(() => {
        if (events.receive(chat, authorized, previewNotices.get())) consume();
      }),
    [chat, authorized, events, tabs],
  );
  useEffect(() => {
    consume();
  }, [catalogue, authorized, visible]);
}
function useRouteRecovery(
  tabs: BrowserTabs,
  catalogue: AiPreviewCatalogue | undefined,
  owner: ServerConnection | null,
): void {
  const recover = useEffectEvent((): void => {
    recoverUnavailableTabs(tabs, catalogue);
  });
  useEffect(() => (owner === null ? undefined : followRouteRecovery(owner, recover)), [owner]);
}
function useTabAuthority(
  tabs: BrowserTabs,
  catalogue: AiPreviewCatalogue | undefined,
  context: {
    readonly profileMatches: boolean;
    readonly connection: ReturnType<typeof connectionState.get>;
  },
): void {
  const { profileMatches, connection } = context;
  const snapshot = usePausable(tabs.subscribe, tabs.read);
  useEffect(() => {
    const ownerLost = !profileMatches || connection.status !== 'paired';
    for (const tab of tabs.read().tabs) {
      if (ownerLost) {
        if (tab.selection !== null || tab.phase === 'opening')
          browserTabOperation(
            tabs.unavailable(tab.id, 'This browser viewer’s profile or paired connection changed.'),
          );
        continue;
      }
      const state = selectionState(tab.selection, catalogue);
      if (state.kind === 'gone') browserTabOperation(tabs.unavailable(tab.id, state.problem));
      else if (state.kind === 'stale')
        browserTabOperation(tabs.replacePublication(tab.id, state.publication));
    }
  }, [tabs, snapshot, catalogue, profileMatches, connection]);
}

function consumePublicationEvents(
  tabs: BrowserTabs,
  pending: BrowserPublicationEvents['pending'],
  catalogue: AiPreviewCatalogue | undefined,
): void {
  for (const [id, notice] of pending) {
    const publication = browserPublications(catalogue).find(
      (row) => row.id === id && (notice.revision === undefined || row.revision === notice.revision),
    );
    if (publication === undefined) continue;
    pending.delete(id);
    const existing = tabs
      .read()
      .tabs.find((tab) => tab.source.kind === 'publication' && tab.source.publication.id === id);
    if (notice.content_changed === true) {
      if (existing !== undefined)
        browserTabOperation(tabs.replacePublication(existing.id, publication));
    } else {
      setLocalPref('chatPanelOpen', true);
      if (existing === undefined) browserTabOperation(tabs.openPublication(publication));
      else {
        tabs.select(existing.id);
        browserTabOperation(tabs.replacePublication(existing.id, publication));
      }
    }
  }
}
