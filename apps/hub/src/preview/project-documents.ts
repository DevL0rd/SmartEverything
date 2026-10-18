import { randomUUID, createHash } from 'node:crypto';
import { join } from 'node:path';
import {
  ApiError,
  AI_PREVIEW_HTML_MAX,
  type AiHtmlPreviewPublication,
  type AiHtmlPreviewWrite,
  type AiProjectPreviewWrite,
  type AiProjectPreviewSource,
  type AiPreviewNotice,
} from '@smarteverything/domain';
import type { Logger } from '@smarteverything/logging';
import type { Store } from '../store/store';
import type { PreviewProjectRow } from '../store/repositories/preview-projects';
import type { Caller } from '../server/auth';
import { projectCallerAuthority, type ProjectAuthority } from '../projects/authority';
import type { ProjectFilesService } from '../projects/service';
import { projectHtml, projectAssetPath, readProjectAsset } from './project-content';
import { ProjectQueue } from '../projects/queue';
import { PreviewProjectWatch } from './project-watch';
import type { HtmlPublication } from './documents';
import { background } from '@smarteverything/logging';

export class PreviewProjectDocuments {
  private readonly mutations = new ProjectQueue();
  private readonly entries = new Map<string, HtmlPublication>();
  private readonly unavailable = new Set<string>();
  private readonly watchers: PreviewProjectWatch;
  private readonly subscriptions: readonly (() => void)[];
  constructor(
    private readonly store: Store,
    private readonly projects: ProjectFilesService,
    private readonly log: Logger,
    private readonly events: {
      readonly notice: (notice: AiPreviewNotice) => void;
      readonly invalidate: (id: string) => void;
    },
  ) {
    this.watchers = new PreviewProjectWatch(log);
    for (const row of store.previewProjects.list()) this.install(row);
    this.subscriptions = [
      projects.onChange((chat, path) => {
        this.changed(chat, path);
      }),
      projects.onDeleting((chat) => {
        for (const entry of this.entries.values())
          if (entry.view.chat_id === chat) {
            this.retire(entry.view.id);
            this.entries.delete(entry.view.id);
          }
      }),
    ];
  }
  publish(
    caller: Caller,
    chat: string,
    input: AiHtmlPreviewWrite,
  ): Promise<AiHtmlPreviewPublication> {
    const id = input.publication_id ?? randomUUID();
    return this.mutations.run(id, () => this.publishHtml(caller, chat, input, id));
  }
  private async publishHtml(
    caller: Caller,
    chat: string,
    input: AiHtmlPreviewWrite,
    id: string,
  ): Promise<AiHtmlPreviewPublication> {
    if (Buffer.byteLength(input.html) > AI_PREVIEW_HTML_MAX)
      throw new ApiError('invalid_request', 'The HTML exceeds its one-megabyte preview limit.');
    const previous = this.previous(chat, input.publication_id, input.revision);
    const authority = this.admissionAuthority(caller, chat, id, previous);
    if (previous !== undefined && previous.view.project_source?.standalone !== true)
      throw new ApiError('conflict', 'Edit the project files instead of replacing its entry.');
    const source: AiProjectPreviewSource = {
      root: `workspace/previews/${id}`,
      entry: 'index.html',
      standalone: true,
    };
    const path = `${source.root}/${source.entry}`;
    const version =
      previous === undefined
        ? null
        : (await readProjectAsset(this.projects, authority, path, { offset: 0, length: 1 }))
            .version;
    await this.projects.execute(authority, {
      operation: 'write',
      path,
      version,
      content: input.html,
      encoding: 'utf8',
    });
    authority.validate(true);
    return this.commit(authority, {
      id,
      title: input.title,
      source,
      previous,
      checksum: createHash('sha256').update(input.html).digest('hex'),
    });
  }
  publishProject(
    caller: Caller,
    chat: string,
    input: AiProjectPreviewWrite,
  ): Promise<AiHtmlPreviewPublication> {
    const id = input.publication_id ?? randomUUID();
    return this.mutations.run(id, () => this.publishDirectory(caller, chat, input, id));
  }
  private async publishDirectory(
    caller: Caller,
    chat: string,
    input: AiProjectPreviewWrite,
    id: string,
  ): Promise<AiHtmlPreviewPublication> {
    const previous = this.previous(chat, input.publication_id, input.revision);
    const authority = this.admissionAuthority(caller, chat, id, previous);
    const source = { root: input.root, entry: input.entry, standalone: false };
    await readProjectAsset(this.projects, authority, `${source.root}/${source.entry}`, {
      offset: 0,
      length: 1,
    });
    authority.validate(true);
    return this.commit(authority, {
      id,
      title: input.title,
      source,
      previous,
      checksum: null,
    });
  }
  private previous(
    chat: string,
    id: string | undefined,
    revision: string | undefined,
  ): HtmlPublication | undefined {
    if ((id === undefined) !== (revision === undefined))
      throw new ApiError(
        'invalid_request',
        'Updates require publication_id and revision together.',
      );
    if (id === undefined) return undefined;
    const previous = this.entries.get(id);
    if (previous?.view.chat_id !== chat)
      throw new ApiError(
        'forbidden',
        'The central preview identity belongs to another chat or is unavailable.',
      );
    if (previous.view.revision !== revision)
      throw new ApiError('conflict', 'The preview changed; use its current revision.');
    return previous;
  }
  private admissionAuthority(
    caller: Caller,
    chat: string,
    id: string,
    previous: HtmlPublication | undefined,
  ): ProjectAuthority {
    const authority = projectCallerAuthority(this.store, caller, chat);
    return {
      ...authority,
      validate: (write): void => {
        authority.validate(write);
        this.assertCurrent(id, previous);
      },
    };
  }
  private assertCurrent(id: string, previous: HtmlPublication | undefined): void {
    if (this.entries.get(id) !== previous)
      throw new ApiError('conflict', 'The publication was replaced or revoked during admission.');
  }
  private commit(
    authority: ProjectAuthority,
    input: {
      readonly id: string;
      readonly title: string;
      readonly source: AiProjectPreviewSource;
      readonly previous: HtmlPublication | undefined;
      readonly checksum: string | null;
    },
  ): AiHtmlPreviewPublication {
    authority.validate(true);
    this.assertCurrent(input.id, input.previous);
    const row: PreviewProjectRow = {
      id: input.id,
      chat_id: authority.chatId,
      profile_id: authority.profileId,
      title: input.title,
      revision: randomUUID(),
      ...input.source,
      standalone: input.source.standalone ? 1 : 0,
      checksum: input.checksum,
    };
    this.store.durableWrite(() => {
      this.store.previewProjects.put(row);
    });
    this.install(row);
    this.announce(row.id, input.previous !== undefined);
    return this.require(row.id).view;
  }
  private install(row: PreviewProjectRow): void {
    const source: AiProjectPreviewSource = {
      root: row.root,
      entry: row.entry,
      standalone: row.standalone === 1,
    };
    const view: AiHtmlPreviewPublication = {
      kind: 'html',
      id: row.id,
      revision: row.revision,
      chat_id: row.chat_id,
      profile_id: row.profile_id,
      title: row.title,
      initial_path: '/',
      expires_at: null,
      project_source: source,
    };
    const authority = this.authority(view);
    this.entries.set(row.id, {
      view,
      validate: (): void => {
        this.validate(view);
      },
      readHtml: () => projectHtml(this.projects, authority, source),
      readAsset: (path, offset, length) =>
        readProjectAsset(this.projects, authority, projectAssetPath(source, path), {
          offset,
          length,
        }),
    });
    this.unavailable.delete(row.id);
    this.watchers.add(row.id, join(this.projects.root(row.chat_id), row.root), {
      changed: (): void => {
        background(this.refresh(row.id), 'project_documents.refresh_failed');
      },
      touched: (): void => {
        this.events.invalidate(row.id);
      },
    });
  }
  private authority(view: AiHtmlPreviewPublication): ProjectAuthority {
    return {
      chatId: view.chat_id,
      profileId: view.profile_id,
      validate: (): void => {
        this.validate(view);
      },
    };
  }
  private validate(view: AiHtmlPreviewPublication): void {
    this.store.aiChats.assertWorkAllowed(view.chat_id);
    if (
      this.unavailable.has(view.id) ||
      this.store.aiChats.chat(view.chat_id).profile_id !== view.profile_id
    )
      throw new ApiError('forbidden', 'The central preview root or chat ownership is unavailable.');
  }
  private changed(chat: string, path: string): void {
    for (const entry of this.entries.values()) {
      const root = entry.view.project_source?.root;
      if (entry.view.chat_id !== chat || root === undefined) continue;
      if (path !== root && !path.startsWith(`${root}/`)) continue;
      this.events.invalidate(entry.view.id);
      this.watchers.signal(entry.view.id, () => {
        background(this.refresh(entry.view.id), 'project_documents.refresh_failed');
      });
    }
  }
  private refresh(id: string): Promise<void> {
    const entry = this.entries.get(id);
    if (entry === undefined) return Promise.resolve();
    return this.mutations
      .run(id, async () => {
        if (this.entries.get(id) === entry) await this.refreshCurrent(id, entry);
      })
      .catch((cause: unknown): void => {
        this.log.warn('project.refresh_failed', {
          publication_id: id,
          error_name: cause instanceof Error ? cause.name : 'unknown',
        });
        this.retire(id);
      });
  }
  private async refreshCurrent(id: string, entry: HtmlPublication): Promise<void> {
    try {
      await entry.readAsset?.('/', 0, 1);
      if (this.entries.get(id) !== entry) return;
      this.validate(entry.view);
      const row = this.store.previewProjects.list().find((value) => value.id === id);
      if (row === undefined) return;
      this.store.previewProjects.put({ ...row, revision: randomUUID(), checksum: null });
      const current = this.store.previewProjects.list().find((value) => value.id === id);
      if (current === undefined)
        throw new ApiError('internal', 'The preview revision reference disappeared.');
      this.install(current);
      this.announce(id, true);
    } catch (cause) {
      this.log.warn('project.refresh_failed', {
        publication_id: id,
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
      this.retire(id);
    }
  }
  private announce(id: string, changed: boolean): void {
    const view = this.require(id).view;
    this.events.invalidate(id);
    this.events.notice({
      type: 'ai_preview',
      chat_id: view.chat_id,
      profile_id: view.profile_id,
      publication_id: id,
      revision: view.revision,
      state: 'published',
      content_changed: changed,
    });
  }
  private retire(id: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined || this.unavailable.has(id)) return;
    this.unavailable.add(id);
    this.watchers.remove(id);
    this.events.invalidate(id);
    this.events.notice({
      type: 'ai_preview',
      chat_id: entry.view.chat_id,
      profile_id: entry.view.profile_id,
      publication_id: id,
      state: 'revoked',
    });
  }
  find(id: string): HtmlPublication | undefined {
    return this.entries.get(id);
  }
  require(id: string): HtmlPublication {
    const entry = this.entries.get(id);
    if (entry === undefined) throw new ApiError('not_found', 'The central preview is unavailable.');
    this.validate(entry.view);
    return entry;
  }
  catalogue(chat: string): readonly HtmlPublication[] {
    return [...this.entries.values()].filter(
      (entry) => entry.view.chat_id === chat && !this.unavailable.has(entry.view.id),
    );
  }
  revoke(id: string): void {
    this.retire(id);
    this.entries.delete(id);
    this.store.previewProjects.remove(id);
  }
  stop(): void {
    for (const unsubscribe of this.subscriptions) unsubscribe();
    this.watchers.stop();
  }
}
