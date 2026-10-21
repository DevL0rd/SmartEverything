import { randomUUID } from 'node:crypto';
import {
  ApiError,
  type EmbeddedBrowserScope,
  type EmbeddedBrowserSnapshot,
  type EmbeddedBrowserResult,
  type EmbeddedBrowserRequest,
  type EMBEDDED_BROWSER_READ,
  type EMBEDDED_BROWSER_SELECTOR,
  EMBEDDED_BROWSER_ACTION,
  type EMBEDDED_BROWSER_EDIT,
  type EmbeddedBrowserAction,
  type EmbeddedBrowserCommand,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import { onBrowserAuthorityChange } from './authority-events';
import type { ViewerFocus } from './viewer-focus';
import type { EmbeddedBrowserAuthority } from './embedded-browser-authority';
import type { ProjectFilesService } from '../projects/service';
import { chatPagePath } from './chat-files';
export interface EmbeddedBrowserViewer {
  readonly scope: EmbeddedBrowserScope;
  readonly perform: (request: EmbeddedBrowserRequest) => Promise<EmbeddedBrowserResult>;
  readonly close: () => void;
}
export class EmbeddedBrowserControllers {
  private readonly viewers = new Map<string, EmbeddedBrowserViewer>();
  private readonly stopFeed: () => void;
  constructor(
    store: Store,
    private readonly authority: EmbeddedBrowserAuthority,
    private readonly focus: ViewerFocus,
    private readonly projects: Pick<ProjectFilesService, 'root'>,
  ) {
    this.stopFeed = onBrowserAuthorityChange(store, () => {
      this.revalidate();
    });
  }
  register(viewer: EmbeddedBrowserViewer): void {
    this.authority.validate(viewer.scope);
    const previous = this.viewers.get(viewer.scope.viewerId);
    if (previous !== undefined && previous.scope.clientId !== viewer.scope.clientId)
      throw new ApiError('conflict', 'This browser viewer is already registered.');
    this.viewers.set(viewer.scope.viewerId, viewer);
    previous?.close();
    this.focus.touch(viewer.scope.viewerId);
  }
  disconnect(close: () => void): void {
    for (const [key, viewer] of this.viewers) if (viewer.close === close) this.viewers.delete(key);
  }
  private select(
    caller: Caller,
    chat: string,
    selector: z.infer<typeof EMBEDDED_BROWSER_SELECTOR>,
  ): EmbeddedBrowserViewer {
    const profile = this.authority.caller(caller, chat);
    const viewer = this.focus.latest(
      [...this.viewers.values()].filter(
        (candidate) =>
          candidate.scope.chatId === chat &&
          candidate.scope.profileId === profile &&
          (selector.viewerId === undefined || selector.viewerId === candidate.scope.viewerId) &&
          (selector.clientId === undefined || selector.clientId === candidate.scope.clientId),
      ),
      (candidate) => candidate.scope.viewerId,
    );
    if (viewer === undefined)
      throw new ApiError('conflict', 'No matching browser is open on a connected device.');
    this.fence(viewer);
    return viewer;
  }
  async read(
    caller: Caller,
    chat: string,
    input: z.infer<typeof EMBEDDED_BROWSER_READ>,
  ): Promise<EmbeddedBrowserSnapshot> {
    const viewer = this.select(caller, chat, input);
    const result = await viewer.perform({
      requestId: randomUUID(),
      scope: viewer.scope,
      operation: {
        kind: 'read',
        view: input.view,
        ...(input.tabId === undefined ? {} : { tabId: input.tabId }),
      },
    });
    this.fence(viewer);
    return result.snapshot;
  }
  async edit(
    caller: Caller,
    chat: string,
    input: z.infer<typeof EMBEDDED_BROWSER_EDIT>,
  ): Promise<EmbeddedBrowserResult> {
    const viewer = this.select(caller, chat, input);
    const resolved = await this.resolve(viewer, input.action);
    if ('settled' in resolved) {
      this.fence(viewer);
      return resolved.settled;
    }
    const { action } = resolved;
    this.authority.action(viewer.scope, action);
    const result = await viewer.perform({
      requestId: randomUUID(),
      scope: viewer.scope,
      operation: { kind: 'edit', action },
    });
    this.fence(viewer);
    return result;
  }
  private async resolve(
    viewer: EmbeddedBrowserViewer,
    command: EmbeddedBrowserCommand,
  ): Promise<
    { readonly action: EmbeddedBrowserAction } | { readonly settled: EmbeddedBrowserResult }
  > {
    if (command.kind === 'open')
      return {
        action: EMBEDDED_BROWSER_ACTION.parse({
          kind: 'open',
          source:
            command.path === undefined
              ? { kind: 'public', url: command.url }
              : {
                  kind: 'project',
                  path: await chatPagePath(this.projects, viewer.scope.chatId, command.path),
                },
        }),
      };
    if (command.kind === 'select' || command.kind === 'reorder' || command.tabId !== undefined)
      return { action: EMBEDDED_BROWSER_ACTION.parse(command) };
    const tabs = await viewer.perform({
      requestId: randomUUID(),
      scope: viewer.scope,
      operation: { kind: 'read', view: 'tabs' },
    });
    const tabId = tabs.snapshot.selectedTabId;
    if (tabId === null) {
      if (command.kind === 'close') return { settled: { snapshot: tabs.snapshot, tabId: null } };
      throw new ApiError('conflict', 'No tab is open; open one first.');
    }
    return { action: EMBEDDED_BROWSER_ACTION.parse({ ...command, tabId }) };
  }
  private fence(viewer: EmbeddedBrowserViewer): void {
    this.authority.validate(viewer.scope);
    if (this.viewers.get(viewer.scope.viewerId) !== viewer)
      throw new ApiError(
        'conflict',
        'The browser viewer disconnected or changed. Delivery is unknown; read current tabs without replaying edits.',
      );
  }
  private revalidate(): void {
    for (const [key, viewer] of this.viewers) {
      try {
        this.authority.validate(viewer.scope);
      } catch (cause) {
        if (!(cause instanceof Error)) throw cause;
        this.viewers.delete(key);
        viewer.close();
      }
    }
  }
  stop(): void {
    this.stopFeed();
    for (const viewer of this.viewers.values()) viewer.close();
    this.viewers.clear();
  }
}
