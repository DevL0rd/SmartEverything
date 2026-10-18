import { randomUUID } from 'node:crypto';
import {
  ApiError,
  type EmbeddedBrowserScope,
  type EmbeddedBrowserSnapshot,
  type EmbeddedBrowserResult,
  type EmbeddedBrowserRequest,
  type EMBEDDED_BROWSER_SELECTOR,
  type EMBEDDED_BROWSER_EDIT,
} from '@smarteverything/domain';
import type { z } from 'zod';
import type { Store } from '../store/store';
import type { Caller } from '../server/auth';
import { onPreviewAuthorityChange } from './authority-events';
import type { ViewerFocus } from './viewer-focus';
import type { EmbeddedBrowserAuthority } from './embedded-browser-authority';
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
  ) {
    this.stopFeed = onPreviewAuthorityChange(store, () => {
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
    selector: z.infer<typeof EMBEDDED_BROWSER_SELECTOR>,
  ): Promise<EmbeddedBrowserSnapshot> {
    const viewer = this.select(caller, chat, selector);
    const result = await viewer.perform({
      requestId: randomUUID(),
      scope: viewer.scope,
      operation: { kind: 'read' },
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
    this.authority.action(viewer.scope, input.action);
    const result = await viewer.perform({
      requestId: input.requestId,
      scope: viewer.scope,
      operation: { kind: 'edit', action: input.action },
    });
    this.fence(viewer);
    return result;
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
