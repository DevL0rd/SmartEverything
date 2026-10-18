import { retiredGatewayLease } from '../data/preview-owner';
import { previewNotices } from '../../../queries/preview-notices';
import { browserTabOperation } from './browser-tab-operation';
import type { ServerConnection } from '../../../api/transport';
import { BrowserTabs } from './browser-tabs';
import { closeBrowserSurfaces } from './browser-surfaces';
import {
  persistBrowserTabs,
  restoreBrowserTabs,
  forgetChatBrowserTabs,
} from './browser-tab-persistence';
interface BrowserWorkspace {
  readonly chatId: string;
  readonly profileId: string;
  readonly clientId: string;
  readonly connection: ServerConnection;
  readonly tabs: BrowserTabs;
  readonly stop: () => void;
}
const workspaces = new Map<string, BrowserWorkspace>();
export function browserWorkspace(
  key: string,
  owner: Omit<BrowserWorkspace, 'tabs' | 'stop'>,
): BrowserTabs {
  const existing = workspaces.get(key);
  if (existing?.connection.token === owner.connection.token) return existing.tabs;
  if (existing !== undefined) closeWorkspace(key, existing);
  const tabs = new BrowserTabs(owner.chatId, owner.profileId);
  tabs.restore(restoreBrowserTabs(key));
  workspaces.set(key, { ...owner, tabs, stop: persistBrowserTabs(key, tabs) });
  return tabs;
}
export function browserTargetProfile(chatId: string, id: string): string | null {
  for (const workspace of workspaces.values()) {
    if (
      workspace.chatId === chatId &&
      workspace.tabs.read().tabs.some((tab) => tab.selection?.target.id === id)
    )
      return workspace.profileId;
  }
  return null;
}
export function browserTabVisible(chatId: string, id: string): boolean {
  for (const workspace of workspaces.values()) {
    if (workspace.chatId !== chatId) continue;
    const snapshot = workspace.tabs.read();
    const selected = snapshot.tabs.find((tab) => tab.id === snapshot.selectedId);
    if (selected?.selection?.target.id === id) return true;
  }
  return false;
}
export function retainBrowserAuthority(
  connection: ServerConnection | null,
  profileId: string | null,
  clientId: string,
): void {
  for (const [key, workspace] of workspaces) {
    if (
      !sameBrowserEnrollment(workspace.connection, connection) ||
      workspace.profileId !== profileId ||
      workspace.clientId !== clientId
    )
      closeWorkspace(key, workspace);
  }
}
export function forgetBrowserChat(chatId: string): void {
  for (const [key, workspace] of workspaces) {
    if (workspace.chatId === chatId) closeWorkspace(key, workspace);
  }
  forgetChatBrowserTabs(chatId);
}
let hostGeneration = 0;
export function ownBrowserRuntime(): () => void {
  const generation = ++hostGeneration;
  return (): void => {
    queueMicrotask(() => {
      if (generation === hostGeneration) closeBrowserRuntime();
    });
  };
}
function closeBrowserRuntime(): void {
  for (const [key, workspace] of workspaces) closeWorkspace(key, workspace);
  closeBrowserSurfaces();
}
function closeWorkspace(key: string, workspace: BrowserWorkspace): void {
  workspaces.delete(key);
  workspace.stop();
  workspace.tabs.dispose();
}

export function followBrowserRevocations(): () => void {
  return previewNotices.subscribe(() => {
    const notice = previewNotices.get();
    if (notice === null || notice.state === 'published') return;
    for (const workspace of workspaces.values()) {
      if (workspace.chatId !== notice.chat_id || workspace.profileId !== notice.profile_id)
        continue;
      for (const tab of workspace.tabs.read().tabs) {
        if (
          tab.source.kind === 'publication' &&
          tab.source.publication.id === notice.publication_id
        )
          browserTabOperation(
            workspace.tabs.unavailable(tab.id, 'This page is no longer shared with this chat.'),
          );
      }
    }
  });
}

export function followGatewayRetirements(): () => void {
  return retiredGatewayLease.subscribe(() => {
    const origin = retiredGatewayLease.get();
    for (const workspace of workspaces.values())
      for (const tab of workspace.tabs.read().tabs) {
        if (
          tab.selection !== null &&
          tab.selection.kind === 'preview' &&
          !('purpose' in tab.selection.lease) &&
          tab.selection.lease.origin === origin
        )
          browserTabOperation(workspace.tabs.renew(tab.id));
      }
  });
}

function sameBrowserEnrollment(owner: ServerConnection, current: ServerConnection | null): boolean {
  return current !== null && owner.url === current.url && owner.token === current.token;
}
