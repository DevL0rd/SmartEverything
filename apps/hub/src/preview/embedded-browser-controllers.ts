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
import type { EmbeddedBrowserAuthority } from './embedded-browser-authority';
export interface EmbeddedBrowserViewer {
  readonly scope: EmbeddedBrowserScope;
  readonly perform: (request: EmbeddedBrowserRequest) => Promise<EmbeddedBrowserResult>;
  readonly close: () => void;
}
const MAX_VIEWERS = 64;
export class EmbeddedBrowserControllers {
  private readonly viewers = new Map<string, EmbeddedBrowserViewer>();
  private readonly stopFeed: () => void;
  constructor(
    store: Store,
    private readonly authority: EmbeddedBrowserAuthority,
  ) {
    this.stopFeed = store.feed.subscribe(() => {
      this.revalidate();
    });
  }
  register(viewer: EmbeddedBrowserViewer): void {
    this.authority.validate(viewer.scope);
    if (this.viewers.has(viewer.scope.viewerId))
      throw new ApiError('conflict', 'This browser viewer is already registered.');
    if (this.viewers.size >= MAX_VIEWERS)
      throw new ApiError('conflict', 'The active browser viewer limit was reached.');
    this.viewers.set(viewer.scope.viewerId, viewer);
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
    const initiating =
      caller.kind === 'service'
        ? caller.authority.client_id
        : caller.kind === 'client'
          ? (caller.authority?.client_id ?? caller.client.id)
          : undefined;
    const clientId =
      selector.clientId ?? (selector.viewerId === undefined ? initiating : undefined);
    const authorized = [...this.viewers.values()].filter(
      (viewer) => viewer.scope.chatId === chat && viewer.scope.profileId === profile,
    );
    const candidates = authorized.filter(
      (viewer) =>
        (selector.viewerId === undefined || selector.viewerId === viewer.scope.viewerId) &&
        (clientId === undefined || clientId === null || viewer.scope.clientId === clientId),
    );
    if (candidates.length !== 1)
      throw new ApiError(
        'conflict',
        `Choose one connected browser viewer explicitly. Candidates: ${JSON.stringify(authorized.map((viewer) => viewer.scope))}`,
      );
    const viewer = candidates[0];
    if (viewer === undefined) throw new ApiError('internal', 'The selected browser disappeared.');
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
    if (input.generation !== viewer.scope.generation)
      throw new ApiError(
        'conflict',
        'The browser registration changed; read current tabs before editing.',
      );
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
