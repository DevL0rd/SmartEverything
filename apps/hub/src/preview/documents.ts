import { randomUUID } from 'node:crypto';
import {
  ApiError,
  AI_PREVIEW_HTML_MAX,
  type AiHtmlPreviewPublication,
  type AiHtmlPreviewWrite,
  type AiPreviewNotice,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { ProjectFilesService } from '../projects/service';
import { PreviewProjectDocuments } from './project-documents';
import type { ProjectAsset } from './project-content';
import type { AiProjectPreviewWrite } from '@smarteverything/domain';
import type { Store } from '../store/store';
import { profileIdOf, type Caller } from '../server/auth';

export interface HtmlPublication {
  readonly view: AiHtmlPreviewPublication;
  readonly readHtml: () => Promise<string>;
  readonly readAsset?: (path: string, offset: number, length: number) => Promise<ProjectAsset>;
  readonly byteLength?: number;
  readonly validate?: () => void;
}
const MAX_DOCUMENTS = 128;
const MAX_HTML_BYTES = 16 * AI_PREVIEW_HTML_MAX;

export class PreviewDocuments {
  readonly projects: PreviewProjectDocuments;
  private readonly entries = new Map<string, HtmlPublication>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly listeners = new Set<(id: string) => void>();
  private readonly revoked = new Set<(id: string) => void>();
  private readonly unsubscribe: () => void;
  constructor(
    private readonly store: Store,
    private readonly notice: (value: AiPreviewNotice) => void,
    projects: ProjectFilesService,
    log: Logger,
  ) {
    this.projects = new PreviewProjectDocuments(store, projects, log, {
      notice,
      invalidate: (id): void => {
        this.invalidate(id);
      },
    });
    this.unsubscribe = store.feed.subscribe(() => {
      this.revalidate();
    });
  }
  publish(
    caller: Caller,
    chat: string,
    input: AiHtmlPreviewWrite,
  ): Promise<AiHtmlPreviewPublication> {
    this.authorize(caller, chat);
    return this.projects.publish(caller, chat, input);
  }
  publishProject(
    caller: Caller,
    chat: string,
    input: AiProjectPreviewWrite,
  ): Promise<AiHtmlPreviewPublication> {
    this.authorize(caller, chat);
    return this.projects.publishProject(caller, chat, input);
  }
  publishOwned(
    profile: string,
    chat: string,
    input: AiHtmlPreviewWrite,
    source: {
      readonly file: NonNullable<AiHtmlPreviewPublication['file_source']>;
      readonly validate: () => void;
    },
  ): AiHtmlPreviewPublication {
    this.store.aiChats.assertWorkAllowed(chat);
    source.validate();
    if (this.store.aiChats.chat(chat).profile_id !== profile)
      throw new ApiError('forbidden', 'The file preview chat belongs to another profile.');
    const previous =
      input.publication_id === undefined ? undefined : this.require(input.publication_id);
    if (
      previous !== undefined &&
      (previous.view.chat_id !== chat ||
        previous.view.profile_id !== profile ||
        previous.validate === undefined)
    )
      throw new ApiError('forbidden', 'The file preview identity is not owned by this chat.');
    return this.put({ profile, chat }, input, previous, source);
  }
  private put(
    owner: { readonly profile: string; readonly chat: string },
    input: AiHtmlPreviewWrite,
    previous: HtmlPublication | undefined,
    source?: {
      readonly file: NonNullable<AiHtmlPreviewPublication['file_source']>;
      readonly validate: () => void;
    },
  ): AiHtmlPreviewPublication {
    const { profile, chat } = owner;
    if (previous !== undefined && previous.view.revision !== input.revision)
      throw new ApiError('conflict', 'The HTML changed; use its current publication revision.');
    this.admitSize(input.html, previous);
    const view: AiHtmlPreviewPublication = {
      kind: 'html',
      ...(source === undefined ? {} : { file_source: source.file }),
      id: previous?.view.id ?? randomUUID(),
      revision: randomUUID(),
      chat_id: chat,
      profile_id: profile,
      title: input.title,
      initial_path: '/',
      expires_at: null,
    };
    if (previous !== undefined) this.invalidate(view.id);
    this.entries.set(view.id, {
      view,
      readHtml: () => Promise.resolve(input.html),
      byteLength: Buffer.byteLength(input.html),
      ...(source === undefined ? {} : { validate: source.validate }),
    });
    this.arm(view);
    this.notice({
      type: 'ai_preview',
      chat_id: chat,
      profile_id: profile,
      publication_id: view.id,
      state: 'published',
      revision: view.revision,
      content_changed: previous !== undefined,
    });
    return view;
  }
  private admitSize(html: string, previous: HtmlPublication | undefined): void {
    if (Buffer.byteLength(html) > AI_PREVIEW_HTML_MAX)
      throw new ApiError('invalid_request', 'The HTML exceeds its one-megabyte preview limit.');
    if (previous === undefined && this.entries.size >= MAX_DOCUMENTS)
      throw new ApiError('conflict', 'The published HTML limit was reached.');
    const bytes = [...this.entries.values()].reduce(
      (total, entry) => total + (entry.byteLength ?? 0),
      0,
    );
    if (bytes - (previous?.byteLength ?? 0) + Buffer.byteLength(html) > MAX_HTML_BYTES)
      throw new ApiError('conflict', 'The active HTML preview byte limit was reached.');
  }
  catalogue(caller: Caller, chat: string): readonly AiHtmlPreviewPublication[] {
    const profile = this.authorize(caller, chat);
    this.revalidate();
    return [...this.entries.values(), ...this.projects.catalogue(chat)]
      .filter((entry) => entry.view.chat_id === chat && entry.view.profile_id === profile)
      .map((entry) => entry.view);
  }
  visible(caller: Caller, chat: string, id: string): HtmlPublication {
    const profile = this.authorize(caller, chat);
    const entry = this.require(id);
    if (entry.view.chat_id !== chat || entry.view.profile_id !== profile)
      throw new ApiError('forbidden', 'This HTML belongs to another chat or profile.');
    return entry;
  }
  private authorize(caller: Caller, chat: string): string {
    this.store.aiChats.assertWorkAllowed(chat);
    const profile = profileIdOf(this.store, caller);
    if (this.store.aiChats.chat(chat).profile_id !== profile)
      throw new ApiError('forbidden', 'This chat belongs to another profile.');
    if (caller.kind === 'client' && this.store.profiles.activeOf(caller.client.id).id !== profile)
      throw new ApiError('forbidden', 'The selected profile is no longer active.');
    if (
      (caller.kind === 'client' || caller.kind === 'service') &&
      caller.chatId !== undefined &&
      caller.chatId !== null &&
      caller.chatId !== chat
    )
      throw new ApiError('forbidden', 'HTML publication must remain in its initiating chat.');
    return profile;
  }
  find(id: string): HtmlPublication | undefined {
    return this.entries.get(id) ?? this.projects.find(id);
  }
  require(id: string): HtmlPublication {
    const entry = this.entries.get(id);
    if (entry === undefined) return this.projects.require(id);
    if (entry.view.expires_at !== null && Date.parse(entry.view.expires_at) <= Date.now())
      throw new ApiError('not_found', 'This HTML preview is unavailable or was revoked.');
    this.store.aiChats.assertWorkAllowed(entry.view.chat_id);
    entry.validate?.();
    if (this.store.aiChats.chat(entry.view.chat_id).profile_id !== entry.view.profile_id)
      throw new ApiError('forbidden', 'The HTML chat ownership changed.');
    return entry;
  }
  revalidate(): void {
    for (const entry of this.entries.values()) {
      try {
        this.require(entry.view.id);
      } catch (cause) {
        if (!(cause instanceof ApiError)) throw cause;
        this.revoke(entry.view.id);
      }
    }
  }
  private arm(view: AiHtmlPreviewPublication): void {
    clearTimeout(this.timers.get(view.id));
    if (view.expires_at === null) return;
    const timer = setTimeout(
      () => {
        this.revoke(view.id);
      },
      Math.max(0, Date.parse(view.expires_at) - Date.now()),
    );
    timer.unref();
    this.timers.set(view.id, timer);
  }
  private invalidate(id: string): void {
    for (const listener of this.listeners) listener(id);
  }
  revoke(id: string): void {
    if (this.projects.find(id) !== undefined) {
      this.projects.revoke(id);
      return;
    }
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    this.entries.delete(id);
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
    this.invalidate(id);
    for (const listener of this.revoked) listener(id);
    this.notice({
      type: 'ai_preview',
      chat_id: entry.view.chat_id,
      profile_id: entry.view.profile_id,
      publication_id: id,
      state: 'revoked',
    });
  }
  onInvalidate(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    return (): void => {
      this.listeners.delete(listener);
    };
  }
  onRevoke(listener: (id: string) => void): () => void {
    this.revoked.add(listener);
    return (): void => {
      this.revoked.delete(listener);
    };
  }
  stop(): void {
    this.unsubscribe();
    this.projects.stop();
    for (const id of this.entries.keys()) this.revoke(id);
  }
}
