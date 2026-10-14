import { currentRequestSignal } from '../server/request-signal';
import { ReferenceLifecycle } from './lifecycle';
import { Logger } from '@smarteverything/logging';
import { createHash } from 'node:crypto';
import {
  AI_MESSAGE_REFERENCES,
  AI_REFERENCE,
  AI_REFERENCE_SOURCE_STATUS,
  AI_REFERENCE_SUMMARY,
  AI_REFERENCE_KINDS,
  AI_REFERENCE_SEARCH,
  AI_REFERENCE_SEARCH_RESULT,
  ApiError,
  referencesMatchText,
  type AiMessageReference,
  type AiReferenceKind,
  type AiReference,
  type AiReferenceSearch,
  type AiReferenceSearchResult,
  type AiReferenceSourceStatus,
} from '@smarteverything/domain';
import type { Caller } from '../server/auth';
import type { Store } from '../store/store';
import { referenceContext, referenceScope } from './context';
import type { ReferenceContext, ReferenceRuntime, ReferenceSource } from './contracts';
import {
  ReferenceCursors,
  closeReferenceCursor,
  finishReferenceCleanup,
  type ReferenceCursor,
} from './cursors';
import { chatReferenceSource } from './chats';
import { managedReferenceSource } from './managed';
import { unavailableReferenceSource } from './unavailable';

export class ReferenceService {
  private readonly log = new Logger('hub.ai-references');
  private readonly lifecycle = new ReferenceLifecycle();
  private closing: Promise<void> | undefined;
  private readonly cursors = new ReferenceCursors();
  private readonly sources = new Map<AiReferenceKind, ReferenceSource>();
  private runtime: ReferenceRuntime | undefined;
  private titleRevision = 0;
  private readonly unsubscribe: () => void;
  constructor(
    private readonly store: Store,
    dataDirectory: string,
  ) {
    for (const kind of AI_REFERENCE_KINDS) this.sources.set(kind, unavailableReferenceSource(kind));
    this.sources.set('managed_path', managedReferenceSource(store, dataDirectory));
    this.sources.set('chat', chatReferenceSource(store));
    this.unsubscribe = store.feed.subscribe((change) => {
      if (change.table !== 'ai_chats') return;
      const changed = [
        change.record?.title !== change.oldRecord?.title,
        change.record?.archived_at !== change.oldRecord?.archived_at,
        change.record?.deletion_state !== change.oldRecord?.deletion_state,
      ];
      if (change.operation !== 'UPDATE' || changed.includes(true)) this.titleRevision += 1;
    });
  }
  attachRuntime(runtime: ReferenceRuntime): void {
    this.lifecycle.validate();
    if (this.runtime !== undefined)
      throw new ApiError('conflict', 'Reference runtime support is already attached.');
    if (new Set(runtime.sources.map((source) => source.kind)).size !== runtime.sources.length)
      throw new ApiError('conflict', 'Runtime reference source kinds must be unique.');
    for (const source of runtime.sources) {
      if (source.kind === 'managed_path' || source.kind === 'chat')
        throw new ApiError(
          'conflict',
          'Runtime reference sources cannot replace central project or chat authority.',
        );
    }
    this.runtime = runtime;
    for (const source of runtime.sources) this.sources.set(source.kind, source);
  }
  async search(
    caller: Caller,
    chatId: string,
    input: AiReferenceSearch,
  ): Promise<AiReferenceSearchResult> {
    const finished = this.lifecycle.begin();
    try {
      const result = await this.performSearch(caller, chatId, input);
      this.lifecycle.validate();
      return result;
    } finally {
      finished();
    }
  }
  private async performSearch(
    caller: Caller,
    chatId: string,
    input: AiReferenceSearch,
  ): Promise<AiReferenceSearchResult> {
    const request = AI_REFERENCE_SEARCH.parse(input);
    const context = this.context(caller, chatId, request);
    const sources = this.statuses(context, request);
    let scope = this.scope(context, request);
    const cursor: ReferenceCursor =
      request.cursor === undefined
        ? { scope, progresses: new Map(), incomplete: new Set<string>() }
        : this.cursors.take(request.cursor, scope);
    try {
      if (request.cursor === undefined) {
        await this.open(cursor, context, request, sources);
        scope = this.scope(context, request);
        cursor.scope = scope;
      }
      const result = await this.page(cursor, context, request, sources);
      context.validate();
      if (this.scope(context, request) !== scope)
        throw new ApiError(
          'conflict',
          'Reference sources changed while searching; start a fresh search.',
        );
      const next = cursor.progresses.size === 0 ? null : await this.cursors.keep(cursor);
      context.validate();
      return AI_REFERENCE_SEARCH_RESULT.parse({ ...result, next_cursor: next });
    } catch (cause) {
      await closeReferenceCursor(cursor);
      throw cause;
    }
  }
  private statuses(
    context: ReferenceContext,
    request: AiReferenceSearch,
  ): AiReferenceSourceStatus[] {
    return (request.kinds ?? AI_REFERENCE_KINDS).map((kind) => {
      const status = AI_REFERENCE_SOURCE_STATUS.parse(this.source(kind).status(context));
      if (status.kind !== kind)
        throw new ApiError('conflict', 'Reference status names another source.');
      return status;
    });
  }
  private scope(context: ReferenceContext, request: AiReferenceSearch): string {
    return createHash('sha256')
      .update(
        JSON.stringify({
          authority: referenceScope(this.store, context),
          query: request.query,
          kinds: request.kinds,
          directory: request.directory,
          container: request.container,
          titles: this.titleRevision,
          runtime: this.runtime?.revision(context),
        }),
      )
      .digest('hex');
  }
  private async open(
    cursor: ReferenceCursor,
    context: ReferenceContext,
    request: AiReferenceSearch,
    statuses: readonly AiReferenceSourceStatus[],
  ): Promise<void> {
    for (const status of statuses) {
      if (status.state === 'unavailable') continue;
      cursor.progresses.set(status.kind, await this.source(status.kind).open(context, request));
    }
  }
  private async page(
    cursor: ReferenceCursor,
    context: ReferenceContext,
    request: AiReferenceSearch,
    sources: readonly AiReferenceSourceStatus[],
  ): Promise<Omit<AiReferenceSearchResult, 'next_cursor'>> {
    const items: AiReferenceSearchResult['items'] = [];
    const quota = Math.max(1, Math.floor(request.limit / Math.max(1, cursor.progresses.size)));
    for (const [kind, progress] of [...cursor.progresses]) {
      if (items.length >= request.limit) break;
      context.validate();
      const page = await progress.next(context, Math.min(quota, request.limit - items.length));
      context.validate();
      if (page.items.length > quota || page.items.length > request.limit - items.length)
        throw new ApiError('conflict', 'Reference source exceeded its bounded metadata quota.');
      for (const raw of page.items) {
        const item = AI_REFERENCE_SUMMARY.parse(raw);
        if (item.reference.kind !== kind)
          throw new ApiError('conflict', 'Reference metadata names another source.');
        items.push(item);
      }
      if (page.incomplete) cursor.incomplete.add(kind);
      else cursor.incomplete.delete(kind);
      if (page.complete) {
        await progress.close();
        cursor.progresses.delete(kind);
      } else {
        cursor.progresses.delete(kind);
        cursor.progresses.set(kind, progress);
      }
    }
    return {
      items,
      sources: [...sources],
      incomplete: cursor.incomplete.size > 0 || cursor.progresses.size > 0,
    };
  }
  private source(kind: AiReferenceKind): ReferenceSource {
    const source = this.sources.get(kind);
    if (source === undefined)
      throw new ApiError('conflict', `Reference source ${kind} is unavailable.`);
    return source;
  }
  async resolve(
    caller: Caller,
    chatId: string,
    text: string,
    input: readonly AiMessageReference[],
  ): Promise<AiMessageReference[]> {
    const finished = this.lifecycle.begin();
    try {
      const result = await this.resolveReferences(caller, chatId, text, input);
      this.lifecycle.validate();
      return result;
    } finally {
      finished();
    }
  }
  private async resolveReferences(
    caller: Caller,
    chatId: string,
    text: string,
    input: readonly AiMessageReference[],
  ): Promise<AiMessageReference[]> {
    const references = AI_MESSAGE_REFERENCES.parse(input);
    if (!referencesMatchText(text, references))
      throw new ApiError(
        'invalid_request',
        'Reference tokens were edited; select their exact identities again.',
      );
    if (references.length === 0) return references;
    const context = this.context(caller, chatId);
    const scope = this.resolutionScope(context);
    const runtime = this.runtime;
    if (runtime === undefined)
      throw new ApiError(
        'conflict',
        'This runtime cannot consume structured references yet; no message was submitted.',
      );
    const resolved: AiMessageReference[] = [];
    for (const item of references) {
      context.validate();
      const reference = AI_REFERENCE.parse(
        await this.source(item.reference.kind).resolve(context, item.reference),
      );
      context.validate();
      if (JSON.stringify(reference) !== JSON.stringify(item.reference))
        throw new ApiError('conflict', 'A referenced identity changed; select it again.');
      resolved.push({ ...item, reference });
    }
    context.validate();
    await runtime.admit(
      context,
      resolved.map((item) => item.reference),
    );
    context.validate();
    if (this.resolutionScope(context) !== scope)
      throw new ApiError('conflict', 'Reference authority changed before submission.');
    return resolved;
  }
  private resolutionScope(context: ReferenceContext): string {
    return `${referenceScope(this.store, context)}:${this.runtime?.revision(context) ?? 'unavailable'}`;
  }
  async revalidateCentral(
    caller: Caller,
    chatId: string,
    references: readonly AiReference[],
  ): Promise<void> {
    const finished = this.lifecycle.begin();
    try {
      const context = this.context(caller, chatId);
      const scope = this.resolutionScope(context);
      for (const reference of references) {
        if (reference.kind !== 'managed_path' && reference.kind !== 'chat') continue;
        const resolved = await this.source(reference.kind).resolve(context, reference);
        if (JSON.stringify(resolved) !== JSON.stringify(reference))
          throw new ApiError('conflict', 'Central reference identity changed before native use.');
      }
      context.validate();
      if (this.resolutionScope(context) !== scope)
        throw new ApiError('conflict', 'Central reference authority changed before native use.');
      this.lifecycle.validate();
    } finally {
      finished();
    }
  }
  stop(): void {
    void this.close().catch((cause: unknown) => {
      this.log.error('references.close_failed', cause);
    });
  }
  close(): Promise<void> {
    if (this.closing === undefined) {
      this.unsubscribe();
      const drained = this.lifecycle.close();
      this.closing = finishReferenceCleanup([this.cursors.close(), drained]);
    }
    return this.closing;
  }
  private context(caller: Caller, chatId: string, request?: AiReferenceSearch): ReferenceContext {
    const context = referenceContext(this.store, caller, chatId, request);
    const current = currentRequestSignal();
    const signal =
      current === undefined
        ? this.lifecycle.signal
        : AbortSignal.any([current, this.lifecycle.signal]);
    return {
      ...context,
      signal,
      validate: (): void => {
        signal.throwIfAborted();
        context.validate();
      },
    };
  }
}
