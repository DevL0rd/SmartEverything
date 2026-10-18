import { randomUUID } from 'node:crypto';
import { ApiError, AI_PREVIEW_CAPABILITY } from '@smarteverything/domain';
import type {
  AiPreviewCatalogue,
  AiPreviewNotice,
  AiHarnessHost,
  AiPreviewPublication,
  AiPreviewServiceWrite,
  HarnessTransportRequest,
  HubPreviewOpen,
} from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { HarnessService } from '../harness/service';
import { onPreviewAuthorityChange } from './authority-events';
import type { Caller } from '../server/auth';
import { profileIdOf } from '../server/auth';

type Native = Extract<
  HarnessTransportRequest['request'],
  { operation: 'preview_publish' | 'preview_revoke' }
>;
export interface Publication {
  view: AiPreviewPublication;
  readonly session: string;
  readonly serviceHandle: string;
  readonly writerExpires: () => number;
  readonly send: (frame: HubPreviewOpen) => void;
}
const log = new Logger('hub.preview');
const STREAM_HORIZON_MS = 24 * 60 * 60_000;
export class PreviewPublications {
  private readonly entries = new Map<string, Publication>();
  private readonly listeners = new Set<(id: string) => void>();
  private readonly subscriptions: readonly (() => void)[];
  constructor(
    private readonly harness: HarnessService,
    private readonly notice: (value: AiPreviewNotice) => void,
  ) {
    this.subscriptions = [
      harness.directory.onRegister((connection) => {
        this.rebind(connection.host);
      }),
      onPreviewAuthorityChange(harness.store, () => {
        this.revalidate();
      }),
    ];
  }
  native(
    binding: Pick<HarnessTransportRequest, 'device_id' | 'generation' | 'runtime_instance'>,
    input: Native,
  ): AiPreviewPublication | { readonly ok: true } {
    this.harness.storage.verify(input.claim, binding);
    return input.operation === 'preview_revoke'
      ? this.revokeOwned(input)
      : this.share(binding, input);
  }
  private revokeOwned(input: Extract<Native, { operation: 'preview_revoke' }>): {
    readonly ok: true;
  } {
    const entry = this.require(input.publication_id);
    if (entry.session !== input.claim.session_id)
      throw new ApiError('forbidden', 'This service belongs to another native session.');
    this.revoke(entry.view.id);
    return { ok: true };
  }
  private share(
    binding: Pick<HarnessTransportRequest, 'device_id' | 'generation' | 'runtime_instance'>,
    input: Extract<Native, { operation: 'preview_publish' }>,
  ): AiPreviewPublication {
    const grant = this.harness.storage.grant(input.claim.session_id);
    const connection = this.harness.directory.bound(
      binding.device_id,
      binding.generation,
      binding.runtime_instance,
    );
    if (
      grant.target.kind !== 'device' ||
      connection.actor.kind !== 'node' ||
      connection.preview === undefined
    ) {
      log.warn('publication.refused', {
        reason: 'host_cannot_share',
        deviceId: binding.device_id,
        targetKind: grant.target.kind,
        actorKind: connection.actor.kind,
        previewSupported: connection.preview !== undefined,
      });
      throw new ApiError(
        'forbidden',
        'Only paired computers that support preview sharing can share services; the hub and phones cannot.',
      );
    }
    if (grant.cwd !== input.workspace) {
      log.warn('publication.refused', {
        reason: 'workspace_mismatch',
        deviceId: binding.device_id,
        sessionId: input.claim.session_id,
      });
      throw new ApiError('forbidden', 'Sharing requires the workspace the session is admitted in.');
    }
    const metadata = this.harness.store.dshSessions.stat(input.claim.session_id, grant.profile_id);
    if (metadata === undefined) throw new ApiError('forbidden', 'The published session is absent.');
    return this.publish(
      binding,
      {
        session: input.claim.session_id,
        workspace: input.workspace,
        service: input.service,
        serviceHandle: input.service_handle,
      },
      { profile: grant.profile_id, chat: metadata.chat_id },
    );
  }
  private publish(
    binding: Pick<HarnessTransportRequest, 'device_id' | 'generation' | 'runtime_instance'>,
    input: {
      readonly session: string;
      readonly workspace: string;
      readonly service: AiPreviewServiceWrite;
      readonly serviceHandle: string;
    },
    owner: { readonly profile: string; readonly chat: string },
  ): AiPreviewPublication {
    const view: AiPreviewPublication = {
      id: randomUUID(),
      revision: randomUUID(),
      chat_id: owner.chat,
      profile_id: owner.profile,
      target: { kind: 'device', device_id: binding.device_id },
      generation: binding.generation,
      runtime_instance: binding.runtime_instance,
      workspace: input.workspace,
      title: input.service.title,
      source_origin: input.service.origin,
      initial_path: input.service.initial_path,
      expires_at: null,
    };
    const entry: Publication = {
      view,
      session: input.session,
      serviceHandle: input.serviceHandle,
      writerExpires: (): number => Date.now() + STREAM_HORIZON_MS,
      send: (frame): void => {
        this.sender(entry)(frame);
      },
    };
    this.entries.set(view.id, entry);
    this.announced(view, binding.device_id, input.session);
    this.notice({
      type: 'ai_preview',
      chat_id: view.chat_id,
      profile_id: view.profile_id,
      publication_id: view.id,
      state: 'published',
    });
    return view;
  }
  private announced(view: AiPreviewPublication, deviceId: string, sessionId: string): void {
    log.info('publication.published', {
      publicationId: view.id,
      chatId: view.chat_id,
      profileId: view.profile_id,
      deviceId,
      generation: view.generation,
      sessionId,
      titleLength: view.title.length,
      publications: this.entries.size,
    });
  }
  private sender(entry: Publication): (frame: HubPreviewOpen) => void {
    const connection = this.harness.directory.get(entry.view.target);
    if (connection.preview === undefined)
      throw new ApiError(
        'conflict',
        'The computer sharing this service no longer supports previews.',
      );
    return connection.preview;
  }
  private rebind(host: AiHarnessHost): void {
    for (const entry of [...this.entries.values()]) {
      if (host.target.kind !== 'device' || host.target.device_id !== entry.view.target.device_id)
        continue;
      if (host.runtime_instance !== entry.view.runtime_instance) {
        log.info('publication.runtime_replaced', { publicationId: entry.view.id });
        this.revoke(entry.view.id);
        continue;
      }
      log.debug('publication.rebound', {
        publicationId: entry.view.id,
        deviceId: host.target.device_id,
        from: entry.view.generation,
        to: host.connection_generation,
      });
      entry.view = { ...entry.view, generation: host.connection_generation };
      this.notice({
        type: 'ai_preview',
        chat_id: entry.view.chat_id,
        profile_id: entry.view.profile_id,
        publication_id: entry.view.id,
        state: 'published',
      });
    }
  }
  catalogue(
    caller: Caller,
    chatId: string,
    gateway: AiPreviewCatalogue['gateway'],
  ): AiPreviewCatalogue {
    this.chat(caller, chatId);
    return {
      capability: AI_PREVIEW_CAPABILITY,
      documents: [],
      publications: [...this.entries.values()]
        .filter((e) => e.view.chat_id === chatId)
        .map((e) => e.view),
      gateway,
    };
  }
  visible(caller: Caller, chatId: string, id: string): Publication {
    this.chat(caller, chatId);
    const entry = this.require(id);
    if (
      entry.view.chat_id !== chatId ||
      entry.view.profile_id !== profileIdOf(this.harness.store, caller)
    )
      throw new ApiError(
        'forbidden',
        'This development service was not shared with this profile and chat.',
      );
    return entry;
  }
  require(id: string): Publication {
    const entry = this.entries.get(id);
    if (entry === undefined)
      throw new ApiError('not_found', 'Sharing was revoked or the origin host disconnected.');
    return entry;
  }
  private chat(caller: Caller, id: string): void {
    const chat = this.harness.store.aiChats.chat(id);
    if (chat.profile_id !== profileIdOf(this.harness.store, caller))
      throw new ApiError('forbidden', 'This chat belongs to another profile.');
    if (
      caller.kind === 'client' &&
      this.harness.store.profiles.activeOf(caller.client.id).id !== chat.profile_id
    )
      throw new ApiError('forbidden', 'The selected profile is no longer active.');
  }
  private revalidate(): void {
    for (const entry of [...this.entries.values()]) {
      try {
        this.harness.store.aiChats.assertWorkAllowed(entry.view.chat_id);
        this.harness.store.aiChats.chat(entry.view.chat_id);
      } catch (cause) {
        if (!(cause instanceof ApiError)) throw cause;
        log.info('publication.revalidation_failed', {
          publicationId: entry.view.id,
          chatId: entry.view.chat_id,
          errorCode: cause.code,
        });
        this.revoke(entry.view.id);
      }
    }
  }
  revoke(id: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    this.entries.delete(id);
    log.info('publication.revoked', {
      publicationId: id,
      chatId: entry.view.chat_id,
      profileId: entry.view.profile_id,
      listeners: this.listeners.size,
      remaining: this.entries.size,
    });
    this.notice({
      type: 'ai_preview',
      chat_id: entry.view.chat_id,
      profile_id: entry.view.profile_id,
      publication_id: id,
      state: 'revoked',
    });
    for (const listener of this.listeners) listener(id);
  }
  onRevoke(listener: (id: string) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  stop(): void {
    for (const unsub of this.subscriptions) unsub();
    for (const id of this.entries.keys()) this.revoke(id);
  }
}
