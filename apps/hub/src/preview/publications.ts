import { isDeepStrictEqual } from 'node:util';
import { AI_PREVIEW_SERVICE_WRITE } from '@smarteverything/domain';
import { admitCanonicalTool } from '../harness/canonical-tools';
import { randomUUID } from 'node:crypto';
import { ApiError, AI_PREVIEW_CAPABILITY } from '@smarteverything/domain';
import type {
  AiPreviewCatalogue,
  AiPreviewNotice,
  DshWriterClaim,
  AiPreviewPublication,
  HarnessTransportRequest,
  HubPreviewOpen,
} from '@smarteverything/domain';
import type { HarnessService } from '../harness/service';
import type { Caller } from '../server/auth';
import { profileIdOf } from '../server/auth';

type Native = Extract<
  HarnessTransportRequest['request'],
  { operation: 'preview_publish' | 'preview_revoke' }
>;
export interface Publication {
  readonly view: AiPreviewPublication;
  readonly session: string;
  readonly epoch: number;
  readonly claim: DshWriterClaim;
  readonly serviceHandle: string;
  readonly writerExpires: () => number;
  readonly send: (frame: HubPreviewOpen) => void;
}
export class PreviewPublications {
  private readonly entries = new Map<string, Publication>();
  private readonly timers = new Map<string, NodeJS.Timeout>();
  private readonly listeners = new Set<(id: string) => void>();
  private readonly subscriptions: readonly (() => void)[];
  constructor(
    private readonly harness: HarnessService,
    private readonly notice: (value: AiPreviewNotice) => void,
  ) {
    this.subscriptions = [
      harness.directory.onOffline(() => {
        this.revalidate();
      }),
      harness.directory.onOwnershipLost(() => {
        this.revalidate();
      }),
      harness.directory.onRegister(() => {
        this.revalidate();
      }),
      harness.store.feed.subscribe(() => {
        this.revalidate();
      }),
    ];
  }
  native(
    binding: Pick<HarnessTransportRequest, 'device_id' | 'generation' | 'runtime_instance'>,
    input: Native,
  ): AiPreviewPublication | { readonly ok: true } {
    this.harness.storage.verify(input.claim, binding);
    admitCanonicalTool(this.harness, {
      operation: 'tool',
      claim: input.claim,
      call_id: input.call_id,
      call_seq: input.call_seq,
      name: input.operation === 'preview_publish' ? 'publish_preview' : 'revoke_preview',
      arguments: input.arguments,
    });
    this.exactServiceScope(input);
    const grant = this.harness.storage.grant(input.claim.session_id);
    if (input.operation === 'preview_revoke') {
      const entry = this.require(input.publication_id);
      if (entry.session !== input.claim.session_id)
        throw new ApiError('forbidden', 'This service belongs to another native session.');
      this.revoke(entry.view.id);
      return { ok: true };
    }
    const connection = this.harness.directory.bound(
      binding.device_id,
      binding.generation,
      binding.runtime_instance,
    );
    if (
      grant.target.kind !== 'device' ||
      connection.actor.kind !== 'node' ||
      !['linux', 'macos'].includes(connection.host.platform) ||
      connection.preview === undefined
    )
      throw new ApiError(
        'forbidden',
        'Only preview-v1 paired Linux/macOS computer hosts can share services; the hub and phones cannot.',
      );
    if (grant.cwd !== input.workspace || grant.permission.sandbox === 'read-only')
      throw new ApiError(
        'forbidden',
        'Sharing requires the admitted workspace and its current native write authority.',
      );
    return this.publish(binding, input, grant.profile_id, connection.preview);
  }
  private exactServiceScope(input: Native): void {
    const matches =
      input.operation === 'preview_publish'
        ? isDeepStrictEqual(AI_PREVIEW_SERVICE_WRITE.parse(input.arguments), input.service)
        : input.arguments['publication_id'] === input.publication_id;
    if (!matches)
      throw new ApiError(
        'forbidden',
        'The literal service grant differs from the canonical native tool arguments.',
      );
  }
  private publish(
    binding: Pick<HarnessTransportRequest, 'device_id' | 'generation' | 'runtime_instance'>,
    input: Extract<Native, { operation: 'preview_publish' }>,
    profile: string,
    send: (frame: HubPreviewOpen) => void,
  ): AiPreviewPublication {
    if (this.entries.size >= 256)
      throw new ApiError('conflict', 'The active published-service limit was reached.');
    const metadata = this.harness.store.dshSessions.stat(input.claim.session_id, profile);
    if (metadata === undefined) throw new ApiError('forbidden', 'The published session is absent.');
    const view: AiPreviewPublication = {
      id: randomUUID(),
      revision: randomUUID(),
      chat_id: metadata.chat_id,
      profile_id: profile,
      target: { kind: 'device', device_id: binding.device_id },
      generation: binding.generation,
      runtime_instance: binding.runtime_instance,
      workspace: input.workspace,
      title: input.service.title,
      source_origin: input.service.origin,
      initial_path: input.service.initial_path,
      expires_at: null,
    };
    this.entries.set(view.id, {
      view,
      session: input.claim.session_id,
      epoch: input.claim.epoch,
      claim: input.claim,
      serviceHandle: input.service_handle,
      writerExpires: (): number => this.validate(this.require(view.id)),
      send,
    });
    const entry = this.require(view.id);
    this.arm(entry, this.validate(entry));
    this.notice({
      type: 'ai_preview',
      chat_id: view.chat_id,
      profile_id: view.profile_id,
      publication_id: view.id,
      state: 'published',
    });
    return view;
  }
  catalogue(
    caller: Caller,
    chatId: string,
    gateway: AiPreviewCatalogue['gateway'],
  ): AiPreviewCatalogue {
    this.chat(caller, chatId);
    this.revalidate();
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
    this.validate(entry);
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
  private validate(entry: Publication): number {
    const view = entry.view;
    const grant = this.harness.storage.grant(entry.session);
    const writer = this.harness.storage.verify(entry.claim, {
      device_id: view.target.device_id,
      generation: view.generation,
      runtime_instance: view.runtime_instance,
    });
    if (
      (view.expires_at !== null && Date.parse(view.expires_at) <= Date.now()) ||
      grant.cwd !== view.workspace ||
      grant.permission.sandbox === 'read-only' ||
      this.harness.store.harnessCoordination.state(entry.session)?.epoch !== entry.epoch
    )
      throw new ApiError(
        'forbidden',
        'This service’s workspace, writer or publication authority changed.',
      );
    return Date.parse(writer.expires_at);
  }
  private arm(entry: Publication, writerExpires: number): void {
    clearTimeout(this.timers.get(entry.view.id));
    const expires =
      entry.view.expires_at === null
        ? writerExpires
        : Math.min(Date.parse(entry.view.expires_at), writerExpires);
    const timer = setTimeout(
      () => {
        this.revalidate();
      },
      Math.max(0, expires - Date.now()),
    );
    timer.unref();
    this.timers.set(entry.view.id, timer);
  }
  private revalidate(): void {
    for (const entry of [...this.entries.values()]) {
      try {
        this.arm(entry, this.validate(entry));
      } catch (cause) {
        if (!(cause instanceof Error))
          throw new ApiError('internal', 'Publication revalidation failed without an Error.');
        this.revoke(entry.view.id);
      }
    }
  }
  revoke(id: string): void {
    const entry = this.entries.get(id);
    if (entry === undefined) return;
    this.entries.delete(id);
    this.notice({
      type: 'ai_preview',
      chat_id: entry.view.chat_id,
      profile_id: entry.view.profile_id,
      publication_id: id,
      state: 'revoked',
    });
    clearTimeout(this.timers.get(id));
    this.timers.delete(id);
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
