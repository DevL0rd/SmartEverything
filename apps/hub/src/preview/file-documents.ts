import {
  ApiError,
  type HarnessTransportRequest,
  type AiHtmlPreviewPublication,
} from '@smarteverything/domain';
import type { HarnessService } from '../harness/service';
import type { Logger } from '@smarteverything/logging';
import type { PreviewDocuments } from './documents';

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
  readonly deviceId: string;
  readonly runtimeInstance: string;
  readonly profile: string;
  readonly chat: string;
}
export class PreviewFileDocuments {
  private readonly files = new Map<string, FileScope>();
  private readonly cancelled = new Map<string, NodeJS.Timeout>();
  private readonly unsubscribe: readonly (() => void)[];
  constructor(
    private readonly harness: HarnessService,
    private readonly documents: Pick<
      PreviewDocuments,
      'publishOwned' | 'require' | 'revoke' | 'revalidate' | 'onRevoke'
    >,
    private readonly log: Logger,
  ) {
    this.unsubscribe = [
      documents.onRevoke((id) => {
        this.close(id);
      }),
      harness.directory.onRegister(() => {
        documents.revalidate();
      }),
    ];
  }
  native(binding: Binding, request: FileRequest): AiHtmlPreviewPublication | { readonly ok: true } {
    this.harness.storage.verify(request.claim, binding);
    if (request.operation === 'preview_file_abandon') return this.abandon(binding, request);
    if (request.operation === 'preview_file_publish') return this.publish(binding, request);
    const scope = this.files.get(request.publication_id);
    if (
      scope === undefined ||
      watchKey(scopeBinding(scope), scope.request) !== watchKey(binding, request)
    )
      throw new ApiError(
        'forbidden',
        'The file watcher does not own this publication and runtime.',
      );
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
    return this.register(binding, request);
  }
  private register(
    binding: Binding,
    request: Extract<FileRequest, { operation: 'preview_file_publish' }>,
  ): AiHtmlPreviewPublication {
    const scope = this.scope(binding, request);
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
      deviceId: binding.device_id,
      runtimeInstance: binding.runtime_instance,
      profile: grant.profile_id,
      chat: metadata.chat_id,
    };
  }
  private validate(scope: FileScope): void {
    const connection = this.harness.directory.registered({
      kind: 'device',
      device_id: scope.deviceId,
    });
    if (connection.host.runtime_instance !== scope.runtimeInstance)
      throw new ApiError('forbidden', 'The computer that watches this file restarted.');
  }
  private close(id: string): void {
    const scope = this.files.get(id);
    if (scope === undefined) return;
    this.files.delete(id);
    try {
      const connection = this.harness.directory.get({ kind: 'device', device_id: scope.deviceId });
      connection.previewFileClose?.({
        type: 'preview_file_close',
        device_id: scope.deviceId,
        generation: connection.host.connection_generation,
        runtime_instance: scope.runtimeInstance,
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
      const timer = setTimeout(() => {
        this.cancelled.delete(key);
      }, 30 * 60_000);
      timer.unref();
      this.cancelled.set(key, timer);
    }
    for (const [id, scope] of this.files)
      if (watchKey(scopeBinding(scope), scope.request) === key) this.documents.revoke(id);
    return { ok: true };
  }
  stop(): void {
    for (const unsubscribe of this.unsubscribe) unsubscribe();
    for (const id of this.files.keys()) this.documents.revoke(id);
    for (const timer of this.cancelled.values()) clearTimeout(timer);
    this.cancelled.clear();
  }
}

function scopeBinding(scope: FileScope): Pick<Binding, 'device_id' | 'runtime_instance'> {
  return { device_id: scope.deviceId, runtime_instance: scope.runtimeInstance };
}

function watchKey(
  binding: Pick<Binding, 'device_id' | 'runtime_instance'>,
  request: Pick<FileRequest, 'claim' | 'watch_handle'>,
): string {
  return `${binding.device_id}:${binding.runtime_instance}:${request.claim.session_id}:${request.watch_handle}`;
}
