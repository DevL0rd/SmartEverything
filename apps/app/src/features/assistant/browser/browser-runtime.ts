import { releasePreviewDiagnostics } from './browser-diagnostics';
import { retiredGatewayLease } from '../data/preview-owner';
import { BROWSER_RETIRED_PROBLEM } from '@smarteverything/domain';
import { previewNotices } from '../../../queries/preview-notices';
import { browserTabOperation } from './browser-tab-operation';
import type { BrowserSurfaceProps } from '../../../platform/browser-contract';
import type { ServerConnection } from '../../../api/transport';
import { ValueStore } from '../../../design/external-store';
import { BrowserTabs } from './browser-tabs';
import {
  persistBrowserTabs,
  restoreBrowserTabs,
  forgetBrowserTabs,
} from './browser-tab-persistence';
export interface BrowserRegion {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}
export interface RetainedBrowserSurface {
  readonly owner: symbol;
  readonly chatId: string;
  readonly props: BrowserSurfaceProps;
  readonly bounds: BrowserRegion;
  readonly attached: boolean;
}
interface BrowserWorkspace {
  readonly chatId: string;
  readonly profileId: string;
  readonly clientId: string;
  readonly connection: ServerConnection;
  readonly tabs: BrowserTabs;
  readonly stop: () => void;
}
const workspaces = new Map<string, BrowserWorkspace>();
export const browserSurfaces = new ValueStore<readonly RetainedBrowserSurface[]>([]);
const EMPTY_REGION: BrowserRegion = { x: 0, y: 0, width: 0, height: 0 };
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
export function retainBrowserSurface(
  chatId: string,
  props: BrowserSurfaceProps,
  owner: symbol,
): () => void {
  const existing = browserSurfaces.get().find((entry) => entry.props.target.id === props.target.id);
  const entry = { owner, chatId, props, bounds: existing?.bounds ?? EMPTY_REGION, attached: true };
  browserSurfaces.set([
    ...browserSurfaces.get().filter((row) => row.props.target.id !== props.target.id),
    entry,
  ]);
  return (): void => {
    const rows = browserSurfaces.get();
    browserSurfaces.set(
      rows.map((row) => (row.owner === owner ? { ...row, attached: false } : row)),
    );
  };
}
export function layoutBrowserSurface(id: string, bounds: BrowserRegion, owner: symbol): void {
  browserSurfaces.set(
    browserSurfaces
      .get()
      .map((entry) =>
        entry.props.target.id === id && entry.owner === owner ? { ...entry, bounds } : entry,
      ),
  );
}
export function closeBrowserSurface(id: string): void {
  releasePreviewDiagnostics(id);
  browserSurfaces.set(browserSurfaces.get().filter((entry) => entry.props.target.id !== id));
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
  chatIds: ReadonlySet<string>,
): void {
  for (const [key, workspace] of workspaces) {
    if (
      !sameBrowserEnrollment(workspace.connection, connection) ||
      workspace.profileId !== profileId ||
      workspace.clientId !== clientId ||
      !chatIds.has(workspace.chatId)
    ) {
      if (
        sameBrowserEnrollment(workspace.connection, connection) &&
        workspace.profileId === profileId &&
        workspace.clientId === clientId &&
        !chatIds.has(workspace.chatId)
      )
        forgetBrowserTabs(key);
      closeWorkspace(key, workspace);
    }
  }
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
export function closeBrowserRuntime(): void {
  for (const [key, workspace] of workspaces) closeWorkspace(key, workspace);
  for (const surface of browserSurfaces.get()) releasePreviewDiagnostics(surface.props.target.id);
  browserSurfaces.set([]);
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
          tab.selection.kind !== 'public' &&
          !('purpose' in tab.selection.lease) &&
          tab.selection.lease.origin === origin
        )
          browserTabOperation(workspace.tabs.unavailable(tab.id, BROWSER_RETIRED_PROBLEM));
      }
  });
}

function sameBrowserEnrollment(owner: ServerConnection, current: ServerConnection | null): boolean {
  return current !== null && owner.url === current.url && owner.token === current.token;
}
