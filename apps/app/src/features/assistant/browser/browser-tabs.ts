import { appPlatform, desktopBridge } from '../../../design/platform';
import { performBrowserTabAction } from './browser-tab-commands';
import { BrowserTabError } from './browser-tab-errors';
export { BrowserTabError } from './browser-tab-errors';
import { browserTabOperation } from './browser-tab-operation';
import { BrowserTabAdmissions } from './browser-tab-admissions';
import {
  browserTabAddress,
  publicationAddress,
  publicAddressTab,
  statusAddress,
} from './browser-tab-address';
import * as Crypto from 'expo-crypto';
import { Linking } from 'react-native';
import {
  BROWSER_RETIRED_PROBLEM,
  type AiPreviewCatalogue,
  type BrowserStatus,
} from '@smarteverything/domain';
import { ValueStore } from '../../../design/external-store';
import { browserCapability } from '../../../platform/browser-surface';
import type { BrowserHandle } from '../../../platform/browser-contract';
import { browserPublications } from './browser-publications';
import { type BrowserPublication, type BrowserSelection } from './browser-selection';
import {
  admitBrowserPublication,
  retireBrowserSelection,
  retireBrowserSelectionQuietly,
} from './browser-tab-admission';
import {
  BROWSER_TAB_ID,
  BROWSER_TAB_LIMIT,
  EMPTY_BROWSER_STATUS,
  closedTabSelection,
  type BrowserTab,
  type BrowserTabId,
  type BrowserTabsSnapshot,
  type BrowserTabsAction,
} from './browser-tab-state';
export class BrowserTabs {
  private readonly state = new ValueStore<BrowserTabsSnapshot>({
    tabs: [],
    selectedId: null,
    problem: null,
  });
  private readonly admissions = new BrowserTabAdmissions();
  private readonly handles = new Map<BrowserTabId, BrowserHandle>();
  private catalogue: AiPreviewCatalogue | undefined;
  private disposed = false;
  constructor(
    readonly chatId: string,
    readonly profileId?: string,
  ) {}
  restore(snapshot: BrowserTabsSnapshot): void {
    if (this.read().tabs.length !== 0) return;
    this.state.set(snapshot);
  }
  loadSelected(): void {
    const tab = this.read().tabs.find((entry) => entry.id === this.read().selectedId);
    if (tab?.phase !== 'dormant') return;
    if (tab.source.kind === 'publication' && this.catalogue === undefined) return;
    browserTabOperation(this.reload(tab.id));
  }
  readonly read = (): BrowserTabsSnapshot => this.state.get();
  readonly subscribe = this.state.subscribe;
  setCatalogue(catalogue: AiPreviewCatalogue | undefined): void {
    this.catalogue = catalogue;
  }
  tab(id: string): BrowserTab {
    const tab = this.read().tabs.find((entry) => entry.id === id);
    if (tab === undefined)
      throw new BrowserTabError('This browser tab is closed or belongs to another viewer.');
    return tab;
  }
  blank(): BrowserTabId {
    if (this.disposed) throw new BrowserTabError('The browser viewer was closed.');
    const snapshot = this.read();
    if (snapshot.tabs.length >= BROWSER_TAB_LIMIT)
      throw new BrowserTabError('Close a tab to open another.');
    const id = BROWSER_TAB_ID.parse(Crypto.randomUUID());
    const tab: BrowserTab = {
      id,
      title: 'New tab',
      address: '',
      editing: false,
      status: EMPTY_BROWSER_STATUS,
      source: { kind: 'blank' },
      problem: null,
      phase: 'blank',
      selection: null,
    };
    const selectedIndex = snapshot.tabs.findIndex((entry) => entry.id === snapshot.selectedId);
    const at = selectedIndex < 0 ? snapshot.tabs.length : selectedIndex + 1;
    this.state.set({
      tabs: [...snapshot.tabs.slice(0, at), tab, ...snapshot.tabs.slice(at)],
      selectedId: id,
      problem: null,
    });
    return id;
  }
  select(id: string): void {
    const tab = this.tab(id);
    this.state.set({ ...this.read(), selectedId: tab.id, problem: null });
  }
  address(id: string, address: string): void {
    this.update(id, (tab) => ({ ...tab, address }));
  }
  editing(id: string, editing: boolean): void {
    this.update(id, (tab) => ({ ...tab, editing }));
  }
  attach(id: BrowserTabId, handle: BrowserHandle | null): void {
    if (handle === null) this.handles.delete(id);
    else this.handles.set(id, handle);
  }
  status(id: BrowserTabId, status: BrowserStatus): void {
    const current = this.read().tabs.find(
      (tab) => tab.id === id && tab.selection?.target.id === status.id,
    );
    if (current === undefined) return;
    if (status.problem === BROWSER_RETIRED_PROBLEM) {
      browserTabOperation(this.unavailable(id, status.problem));
      return;
    }
    this.update(id, (tab) => {
      if (tab.selection?.target.id !== status.id) return tab;
      const address = tab.editing
        ? tab.address
        : statusAddress(tab.selection, status.url, tab.address);
      return {
        ...tab,
        address,
        status,
        ...(tab.selection.kind === 'public' && status.url !== ''
          ? { source: { kind: 'public' as const, url: status.url } }
          : {}),
      };
    });
  }
  async openPublication(
    publication: BrowserPublication,
    preferredId?: BrowserTabId,
  ): Promise<void> {
    const existing = this.read().tabs.find(
      (tab) => tab.source.kind === 'publication' && tab.source.publication.id === publication.id,
    );
    if (existing !== undefined) {
      this.select(existing.id);
      if (existing.phase === 'dormant') await this.reload(existing.id);
      return;
    }
    const id = preferredId ?? this.blank();
    this.select(id);
    await this.replacePublication(id, publication);
  }
  async replacePublication(id: BrowserTabId, publication: BrowserPublication): Promise<void> {
    const generation = await this.begin(
      id,
      { kind: 'publication', publication },
      publication.title,
      publicationAddress(publication),
    );
    if (!this.matches(id, generation)) return;
    try {
      const selection = await admitBrowserPublication(this.chatId, publication);
      if (!this.matches(id, generation)) {
        await retireBrowserSelection(selection);
        return;
      }
      this.update(id, (tab) => ({
        ...tab,
        phase: 'ready',
        selection,
        status: { ...EMPTY_BROWSER_STATUS, id: selection.target.id, loading: true },
        problem: null,
      }));
      this.admissions.expire(id, selection, () => {
        browserTabOperation(this.unavailable(id, 'Preview access expired. Reload to renew it.'));
      });
    } catch (error: unknown) {
      if (!this.matches(id, generation)) return;
      const problem =
        error instanceof Error ? error.message : 'The browser page could not be opened.';
      this.update(id, (tab) => ({
        ...tab,
        phase: 'unavailable',
        selection: null,
        problem,
        status: EMPTY_BROWSER_STATUS,
      }));
      throw error;
    }
  }
  async navigate(id: string, address: string): Promise<void> {
    const tab = this.tab(id);
    const parsed = browserTabAddress(tab, address, this.catalogue?.publications ?? []);
    if (parsed.kind === 'document') return this.reload(id);
    if (parsed.kind === 'rejected') {
      this.update(id, (entry) => ({ ...entry, problem: parsed.reason }));
      throw new BrowserTabError(parsed.reason);
    }
    if (parsed.kind === 'preview') {
      if (
        tab.selection?.kind === 'preview' &&
        tab.selection.publication.id === parsed.publication.id
      ) {
        this.handle(tab.id).navigate(`${tab.selection.lease.origin}${parsed.path}`);
        this.update(id, (entry) => ({ ...entry, editing: false, problem: null }));
      } else
        await this.replacePublication(tab.id, { ...parsed.publication, initial_path: parsed.path });
      return;
    }
    await this.navigatePublic(tab, parsed.url);
  }
  private async navigatePublic(tab: BrowserTab, url: string): Promise<void> {
    const publicBrowsing = browserCapability().publicBrowsing;
    if (publicBrowsing && tab.selection?.kind === 'public') {
      this.handle(tab.id).navigate(url);
      this.update(tab.id, (entry) => publicAddressTab(entry, url));
      return;
    }
    const generation = await this.begin(
      tab.id,
      { kind: 'public', url },
      new URL(url).hostname,
      url,
    );
    if (!this.matches(tab.id, generation)) return;
    if (!publicBrowsing) {
      await Linking.openURL(url);
      if (this.matches(tab.id, generation))
        this.update(tab.id, (entry) => ({
          ...entry,
          phase: 'unavailable',
          selection: null,
          problem: 'Opened this public website in your external browser.',
          editing: false,
          status: EMPTY_BROWSER_STATUS,
        }));
      return;
    }
    const selection: BrowserSelection = {
      kind: 'public',
      target: {
        kind: 'public',
        id: `public:${Crypto.randomUUID()}`,
        url,
        ...publicProfileData(this.profileId),
      },
    };
    this.update(tab.id, (entry) => ({
      ...entry,
      phase: 'ready',
      selection,
      problem: null,
      status: { ...EMPTY_BROWSER_STATUS, id: selection.target.id, loading: true },
    }));
  }
  async reload(id: string): Promise<void> {
    const tab = this.tab(id);
    if (tab.phase === 'ready') {
      this.handle(tab.id).reload();
      this.update(tab.id, (entry) => ({ ...entry, problem: null }));
      return;
    }
    if (tab.source.kind === 'public') return this.navigatePublic(tab, tab.source.url);
    if (tab.source.kind !== 'publication')
      throw new BrowserTabError('Enter an address to open this tab.');
    const sourceId = tab.source.publication.id;
    const current = browserPublications(this.catalogue).find((row) => row.id === sourceId);
    if (current === undefined)
      throw new BrowserTabError('This page is no longer shared with this chat.');
    await this.replacePublication(tab.id, current);
  }
  async close(id: string): Promise<void> {
    const tab = this.tab(id);
    this.admissions.close(tab.id);
    this.handles.delete(tab.id);
    const snapshot = this.read();
    this.state.set({
      tabs: snapshot.tabs.filter((entry) => entry.id !== id),
      selectedId: closedTabSelection(snapshot, id),
      problem: null,
    });
    if (tab.selection !== null) await retireBrowserSelection(tab.selection);
  }
  reorder(ids: readonly string[]): void {
    const snapshot = this.read();
    if (
      ids.length !== snapshot.tabs.length ||
      new Set(ids).size !== ids.length ||
      ids.some((id) => !snapshot.tabs.some((tab) => tab.id === id))
    )
      throw new BrowserTabError('Tab order must contain every current tab exactly once.');
    const tabs = ids.map((id) => this.tab(id));
    this.state.set({ ...snapshot, tabs });
  }
  async unavailable(id: BrowserTabId, problem: string): Promise<void> {
    const tab = this.tab(id);
    this.admissions.cancel(id);
    this.update(id, (entry) => ({
      ...entry,
      phase: 'unavailable',
      selection: null,
      problem,
      status: EMPTY_BROWSER_STATUS,
    }));
    if (tab.selection !== null) await retireBrowserSelection(tab.selection);
  }
  perform(action: BrowserTabsAction, signal?: AbortSignal): Promise<void> {
    return performBrowserTabAction(this, action, this.catalogue, signal);
  }
  async guardAdmission(
    id: BrowserTabId,
    start: () => Promise<void>,
    signal: AbortSignal | undefined,
  ): Promise<void> {
    const operation = start();
    const generation = this.admissions.generation(id);
    const abort = (): void => {
      if (
        this.admissions.generation(id) === generation &&
        this.read().tabs.some((tab) => tab.id === id && tab.phase === 'opening')
      )
        browserTabOperation(
          this.unavailable(id, 'The initiating browser controller disconnected.'),
        );
    };
    signal?.addEventListener('abort', abort, { once: true });
    try {
      await operation;
      if (signal?.aborted === true) throw new BrowserTabError('The browser command was cancelled.');
    } finally {
      signal?.removeEventListener('abort', abort);
    }
  }
  dispose(): void {
    this.disposed = true;
    for (const tab of this.read().tabs) {
      this.admissions.close(tab.id);
      if (tab.selection !== null) retireBrowserSelectionQuietly(tab.selection);
    }
    this.handles.clear();
    this.state.set({ tabs: [], selectedId: null, problem: null });
  }
  private handle(id: BrowserTabId): BrowserHandle {
    const handle = this.handles.get(id);
    if (handle === undefined)
      throw new BrowserTabError('Wait for this browser page to finish opening.');
    return handle;
  }
  private async begin(
    id: BrowserTabId,
    source: BrowserTab['source'],
    title: string,
    address: string,
  ): Promise<number> {
    const tab = this.tab(id);
    const generation = this.admissions.cancel(id);
    this.update(id, (entry) => ({
      ...entry,
      source,
      title,
      address: entry.editing ? entry.address : address,
      phase: 'opening',
      selection: null,
      problem: null,
      status: { ...EMPTY_BROWSER_STATUS, loading: true },
    }));
    if (tab.selection !== null) await retireBrowserSelection(tab.selection);
    return generation;
  }
  private matches(id: BrowserTabId, generation: number): boolean {
    return (
      !this.disposed &&
      this.admissions.generation(id) === generation &&
      this.read().tabs.some((tab) => tab.id === id)
    );
  }
  private update(id: string, change: (tab: BrowserTab) => BrowserTab): void {
    const snapshot = this.read();
    this.state.set({
      ...snapshot,
      tabs: snapshot.tabs.map((tab) => (tab.id === id ? change(tab) : tab)),
    });
  }
}

function publicProfileData(profileId: string | undefined): { readonly profileId?: string } {
  if (profileId === undefined) return {};
  if (appPlatform() === 'desktop' && (desktopBridge()?.browser?.publicSessionVersion?.() ?? 0) < 1)
    return {};
  return { profileId };
}
