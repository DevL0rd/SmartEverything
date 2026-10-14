import { resolve, relative, isAbsolute, sep } from 'node:path';
import {
  ApiError,
  AI_FILE_PREVIEW_WRITE,
  type HarnessTransportRequest,
  type AiHtmlPreviewPublication,
  type HubPreviewFileClose,
} from '@smarteverything/domain';
import { admitCanonicalTool } from '../harness/canonical-tools';
import type { HarnessService } from '../harness/service';
import type { Logger } from '@smarteverything/logging';
import type { PreviewDocuments } from './documents';
import { DshSessionStorageError } from '../store/repositories/dsh-session-errors';

type FileRequest = Extract<
  HarnessTransportRequest['request'],
  {
    operation:
      | 'preview_file_publish'
      | 'preview_file_validate'
      | 'preview_file_update'
      | 'preview_file_abandon';
  }
>;
type Binding = Pick<HarnessTransportRequest, 'device_id' | 'generation' | 'runtime_instance'>;
interface FileScope {
  readonly request: Extract<FileRequest, { operation: 'preview_file_publish' }>;
  readonly binding: Binding;
  readonly profile: string;
  readonly chat: string;
  readonly close: (frame: HubPreviewFileClose) => void;
}
export class PreviewFileDocuments {
  private readonly files = new Map<string, FileScope>();
  private readonly cancelled = new Map<string, NodeJS.Timeout>();
  private readonly unsubscribe: readonly (() => void)[];
  constructor(
    private readonly harness: HarnessService,
    private readonly documents: PreviewDocuments,
    private readonly log: Logger,
  ) {
    const revalidate = (): void => {
      documents.revalidate();
    };
    this.unsubscribe = [
      documents.onRevoke((id) => {
        this.close(id);
      }),
      harness.directory.onOffline(revalidate),
      harness.directory.onOwnershipLost(revalidate),
      harness.directory.onRegister(revalidate),
    ];
  }
  native(binding: Binding, request: FileRequest): AiHtmlPreviewPublication | { readonly ok: true } {
    this.harness.storage.verify(request.claim, binding);
    if (request.operation === 'preview_file_abandon') return this.abandon(binding, request);
    if (request.operation === 'preview_file_publish') return this.publish(binding, request);
    const scope = this.files.get(request.publication_id);
    if (
      scope === undefined ||
      watchKey(scope.binding, scope.request) !== watchKey(binding, request)
    )
      throw new ApiError(
        'forbidden',
        'The file watcher does not own this publication and runtime.',
      );
    this.validate(scope);
    const current = this.documents.require(request.publication_id);
    if (request.operation === 'preview_file_validate') return { ok: true };
    return this.documents.publishOwned(
      scope.profile,
      scope.chat,
      {
        title: current.view.title,
        html: request.html,
        publication_id: current.view.id,
        revision: request.revision,
      },
      {
        file: {
          device_id: binding.device_id,
          workspace: scope.request.workspace,
          file_path: scope.request.file_path,
        },
        validate: (): void => {
          this.validate(scope);
        },
      },
    );
  }
  private publish(
    binding: Binding,
    request: Extract<FileRequest, { operation: 'preview_file_publish' }>,
  ): AiHtmlPreviewPublication {
    if (this.cancelled.has(watchKey(binding, request)))
      throw new ApiError('conflict', 'This file publication was cancelled before admission.');
    admitCanonicalTool(this.harness, {
      operation: 'tool',
      claim: request.claim,
      name: 'publish_file_preview',
      call_id: request.call_id,
      call_seq: request.call_seq,
      arguments: request.arguments,
    });
    verifyFileArguments(request);
    const scope = this.scope(binding, request);
    this.validate(scope);
    if (
      [...this.files.values()].some((entry) => entry.request.watch_handle === request.watch_handle)
    )
      throw new ApiError('conflict', 'The file watch handle was already published.');
    const view = this.documents.publishOwned(
      scope.profile,
      scope.chat,
      { title: request.title, html: request.html },
      {
        file: {
          device_id: binding.device_id,
          workspace: request.workspace,
          file_path: request.file_path,
        },
        validate: (): void => {
          this.validate(scope);
        },
      },
    );
    this.files.set(view.id, scope);
    return view;
  }
  private scope(
    binding: Binding,
    request: Extract<FileRequest, { operation: 'preview_file_publish' }>,
  ): FileScope {
    const grant = this.harness.storage.grant(request.claim.session_id);
    const metadata = this.harness.store.dshSessions.stat(
      request.claim.session_id,
      grant.profile_id,
    );
    if (metadata === undefined)
      throw new ApiError('forbidden', 'The native file session is absent.');
    const connection = this.harness.directory.bound(
      binding.device_id,
      binding.generation,
      binding.runtime_instance,
    );
    if (connection.previewFileClose === undefined || connection.actor.kind !== 'node')
      throw new ApiError(
        'forbidden',
        'This computer did not negotiate native file preview support.',
      );
    return {
      request,
      binding,
      profile: grant.profile_id,
      chat: metadata.chat_id,
      close: connection.previewFileClose,
    };
  }
  private validate(scope: FileScope): void {
    try {
      this.requireScope(scope);
    } catch (cause) {
      if (
        cause instanceof DshSessionStorageError &&
        (cause.code === 'ownership-lost' || cause.code === 'forbidden')
      )
        throw new ApiError('forbidden', 'The file preview lost its native writer.');
      throw cause;
    }
  }
  private requireScope(scope: FileScope): void {
    this.harness.storage.verify(scope.request.claim, scope.binding);
    const grant = this.harness.storage.grant(scope.request.claim.session_id);
    this.harness.directory.bound(
      scope.binding.device_id,
      scope.binding.generation,
      scope.binding.runtime_instance,
    );
    if (
      grant.cwd !== scope.request.workspace ||
      grant.profile_id !== scope.profile ||
      grant.target.kind !== 'device' ||
      grant.target.device_id !== scope.binding.device_id ||
      grant.permission.sandbox === 'read-only'
    )
      throw new ApiError(
        'forbidden',
        'The source file workspace or publication authority changed.',
      );
  }
  private close(id: string): void {
    const scope = this.files.get(id);
    if (scope === undefined) return;
    this.files.delete(id);
    try {
      scope.close({
        type: 'preview_file_close',
        ...scope.binding,
        watch_handle: scope.request.watch_handle,
      });
    } catch (cause) {
      this.log.warn('file.close_unavailable', {
        error_name: cause instanceof Error ? cause.name : 'unknown',
      });
    }
  }
  private abandon(
    binding: Binding,
    request: Extract<FileRequest, { operation: 'preview_file_abandon' }>,
  ): { readonly ok: true } {
    const key = watchKey(binding, request);
    if (!this.cancelled.has(key)) {
      if (this.cancelled.size >= 256)
        throw new ApiError('conflict', 'The file cancellation limit was reached.');
      const timer = setTimeout(() => {
        this.cancelled.delete(key);
      }, 30 * 60_000);
      timer.unref();
      this.cancelled.set(key, timer);
    }
    for (const [id, scope] of this.files)
      if (watchKey(scope.binding, scope.request) === key) this.documents.revoke(id);
    return { ok: true };
  }
  stop(): void {
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    for (const id of this.files.keys()) this.documents.revoke(id);
    for (const timer of this.cancelled.values()) clearTimeout(timer);
    this.cancelled.clear();
  }
}

function watchKey(binding: Binding, request: Pick<FileRequest, 'claim' | 'watch_handle'>): string {
  return `${binding.device_id}:${binding.generation}:${binding.runtime_instance}:${request.claim.session_id}:${String(request.claim.epoch)}:${request.watch_handle}`;
}

function verifyFileArguments(
  request: Extract<FileRequest, { operation: 'preview_file_publish' }>,
): void {
  const argumentsValue = AI_FILE_PREVIEW_WRITE.parse(request.arguments);
  const file = resolve(request.workspace, argumentsValue.file_path);
  const inside = relative(request.workspace, file);
  if (
    file !== request.file_path ||
    argumentsValue.title !== request.title ||
    inside === '' ||
    inside === '..' ||
    inside.startsWith(`..${sep}`) ||
    isAbsolute(inside)
  )
    throw new ApiError(
      'forbidden',
      'The file preview differs from its exact authorized workspace arguments.',
    );
}
