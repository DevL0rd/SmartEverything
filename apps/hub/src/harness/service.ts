import { projectHarnessContext, projectContextRequest } from './context-projection';
import { harnessContextPercent } from '@smarteverything/domain';
import { switchConversation } from './switch-conversation';
import { HarnessDiscovery } from './discovery';
import { HarnessSkillUpdatesService } from './skill-updates';
import { systemClock, type Clock } from '../clock';
import { projectNativeWorkspace } from './workspace-publication';
import { refusedNativeInput } from './input-refusal';
import { HarnessSubscriptions } from './subscriptions';
import { HarnessConfigurationService } from './configuration';
import { HarnessExtensions } from './extensions';
import { randomUUID } from 'node:crypto';
import type { HarnessGrant } from '../store/repositories/harness-coordination';
import { prepareConversation } from './preparation';
import { changePermission, confirmedPermission } from './permission';
import { ApiError, AI_HARNESS_SESSION, harnessTargetKey } from '@smarteverything/domain';
import type {
  AiChatRow,
  DshEngine,
  HarnessRuntimeRequest,
  AiModelRouteSelection,
  AiHarnessSession,
  AiHarnessHandoffRequest,
  AiHarnessHandoff,
  AiHarnessAnswer,
  AiHarnessHost,
  AiHarnessEvent,
  AiHarnessPermissionChange,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessAuthority } from '@smarteverything/harness';
import { HarnessDirectory } from './directory';
import { HarnessStorage } from './storage';
import type { HarnessRoutes } from './routes';
import type { DshSessionPrincipal } from '../store/repositories/dsh-session-claims';

export class HarnessService {
  private readonly switching = new Map<string, Promise<AiHarnessHandoff>>();
  private readonly listeners = new Map<string, (event: AiHarnessEvent) => void>();
  readonly directory = new HarnessDirectory((request) => {
    this.admitWork(request);
  });
  readonly storage: HarnessStorage;
  readonly configuration: HarnessConfigurationService;
  readonly extensions: HarnessExtensions;
  readonly discovery: HarnessDiscovery;
  readonly skillUpdates: HarnessSkillUpdatesService;
  readonly subscriptions: HarnessSubscriptions;
  constructor(
    readonly store: Store,
    readonly routes: HarnessRoutes,
    private readonly announce: (event: AiHarnessEvent, profileId: string) => void,
    options?: { readonly stateDirectory: string; readonly clock: Clock },
  ) {
    this.storage = new HarnessStorage(store, this.directory);
    this.subscriptions = new HarnessSubscriptions(this.directory, routes);
    this.configuration = new HarnessConfigurationService(
      store.harnessConfiguration,
      this.directory,
    );
    this.extensions = new HarnessExtensions(
      this.configuration,
      store.harnessSkillPresentations,
      options?.stateDirectory,
    );
    this.discovery = new HarnessDiscovery(this.configuration);
    this.skillUpdates = new HarnessSkillUpdatesService(
      store.harnessSkillUpdates,
      this.configuration,
      this.extensions,
      {
        source: this.discovery.skills,
        plugins: this.discovery.plugins,
        clock: options?.clock ?? systemClock,
      },
    );
  }
  own(owner: ChatOwner, chatId: string): AiChatRow {
    const chat = this.store.aiChats.chat(chatId);
    if (chat.profile_id !== owner.profileId)
      throw new ApiError('forbidden', 'This chat belongs to a different profile.');
    return chat;
  }
  binding(chat: AiChatRow): DshEngine {
    if (chat.engine.kind !== 'dsh')
      throw new ApiError('conflict', 'This chat has a different native engine boundary.');
    return chat.engine;
  }
  state(owner: ChatOwner, chatId: string): AiHarnessSession {
    const chat = this.own(owner, chatId);
    const binding = this.binding(chat);
    if (binding.session_id === null)
      throw new ApiError(
        'conflict',
        'This native chat has not been opened on its selected execution host.',
      );
    const state = this.store.harnessCoordination.state(binding.session_id);
    if (state === undefined)
      throw new ApiError('conflict', 'Native session projection is unavailable.');
    const metadata = this.store.dshSessions.stat(binding.session_id, chat.profile_id);
    if (metadata === undefined)
      throw new ApiError('conflict', 'Native session metadata is unavailable.');
    if (metadata.chat_id !== chat.id)
      throw new ApiError(
        'forbidden',
        'A native session can be bound to only its original conversation.',
      );
    return AI_HARNESS_SESSION.parse({
      ...state,
      metadata,
      permission_change: this.store.harnessCoordination.permissionChange(binding.session_id),
    });
  }
  permission(
    owner: ChatOwner,
    chatId: string,
    input: AiHarnessPermissionChange,
  ): Promise<AiHarnessSession> {
    return changePermission(this, owner, chatId, input);
  }
  prepare(
    owner: ChatOwner,
    chatId: string,
    authority: HarnessAuthority,
    localClientId?: string,
  ): Extract<HarnessRuntimeRequest, { kind: 'open' }> {
    return prepareConversation(this, { owner, chatId, authority, localClientId });
  }
  selection(chat: AiChatRow): AiModelRouteSelection {
    const binding = this.binding(chat);
    const route = this.routes
      .list(chat.profile_id)
      .find((entry) => entry.id === binding.model_route_id);
    if (route === undefined)
      throw new ApiError('conflict', 'The selected explicit supplier route is unknown.');
    return {
      route_id: route.id,
      ...(route.credential_generation === undefined
        ? {}
        : { credential_generation: route.credential_generation }),
      capability_revision: route.capability_revision,
      model: binding.model,
      effort: binding.effort,
    };
  }
  async answer(owner: ChatOwner, chatId: string, answer: AiHarnessAnswer): Promise<void> {
    const chat = this.own(owner, chatId);
    const id = this.boundSession(chat);
    const receipt = this.store.harnessCoordination.begin(answer.operation_id, id, answer);
    if (receipt.state === 'completed') return;
    const session = this.state(owner, chatId);
    if (
      session.epoch !== answer.expected_epoch ||
      !session.interactions.some((entry) => entry.id === answer.interaction_id)
    )
      throw new ApiError(
        'conflict',
        'This interaction is no longer pending at the selected native epoch.',
      );
    await this.directory.execute(session.target, answer.operation_id, {
      kind: 'answer',
      session_id: session.session_id,
      expected_epoch: answer.expected_epoch,
      answer,
    });
    this.store.harnessCoordination.finish(answer.operation_id, { ok: true });
  }
  async switch(
    owner: ChatOwner,
    chatId: string,
    input: AiHarnessHandoffRequest,
    localClientId?: string,
  ): Promise<AiHarnessHandoff> {
    return switchConversation(this, this.switching, { owner, chatId, input, localClientId });
  }
  admitSwitch(chat: AiChatRow, operation: string): void {
    if (this.store.harnessCoordination.permissionChange(this.boundSession(chat)) !== null)
      throw new ApiError(
        'conflict',
        'Confirm the pending permission change before switching hosts.',
      );
    const active = this.store.harnessCoordination.state(this.boundSession(chat))?.handoff;
    if (
      active !== null &&
      active !== undefined &&
      active.id !== operation &&
      active.stage !== 'completed' &&
      active.stage !== 'failed'
    )
      throw new ApiError(
        'conflict',
        'Another admitted handoff is still pending for this conversation.',
      );
  }
  onEvent(listener: (event: AiHarnessEvent) => void, consumer: string = randomUUID()): () => void {
    if (this.listeners.has(consumer))
      throw new ApiError('conflict', 'A native event consumer is already attached.');
    this.listeners.set(consumer, listener);
    return () => {
      this.listeners.delete(consumer);
    };
  }
  publish(event: AiHarnessEvent): void {
    const grant = this.storage.grant(event.session_id);
    const session = this.validateEvent(event, grant);
    const retained = this.store.harnessRecovery.retained(event);
    const refusal = refusedNativeInput(this.store, event);
    if (retained !== undefined && refusal !== undefined) throw refusal;
    if (retained !== undefined) {
      this.replay(event.session_id);
      return;
    }
    const policy = event.kind === 'state' ? confirmedPermission(this, event) : undefined;
    const next = {
      ...this.nextProjection(event, session),
      ...(policy === undefined ? {} : { permission: policy.permission }),
    };
    if (event.kind === 'tool' && harnessTargetKey(event.target) !== harnessTargetKey(grant.target))
      throw new ApiError('forbidden', 'Native tool publication names another execution host.');
    const published = event.kind === 'state' ? { ...event, session: next } : event;
    this.store.harnessCoordination.accept(
      next,
      published,
      (): void => {
        if (policy !== undefined) {
          const chat = this.store.aiChats.chat(event.chat_id);
          this.store.aiChats.update(chat.id, {
            engine: { ...this.binding(chat), permission: policy.permission },
          });
        }
        this.store.harnessRecovery.keep(published, event);
        this.noteContext(published);
      },
      policy,
    );
    this.replay(event.session_id);
  }
  private noteContext(event: AiHarnessEvent): void {
    if (event.kind === 'usage') {
      if (event.context_percent !== null)
        this.store.aiChats.noteContext(event.chat_id, Math.round(event.context_percent));
      return;
    }
    if (event.kind !== 'state' || event.session.context === undefined) return;
    const percent = harnessContextPercent(event.session.context);
    this.store.aiChats.noteContext(event.chat_id, percent === null ? null : Math.round(percent));
  }
  replay(sessionId?: string): void {
    for (const [consumer, listener] of this.listeners) {
      for (const event of this.store.harnessRecovery.pending(consumer, sessionId)) {
        listener(event);
        this.store.harnessRecovery.ack(event, consumer);
      }
    }
    for (const event of this.store.harnessRecovery.pending('live-v1', sessionId)) {
      const metadata = this.store.dshSessions.stat(
        event.session_id,
        this.store.aiChats.chat(event.chat_id).profile_id,
      );
      if (metadata === undefined)
        throw new ApiError('conflict', 'Retained native publication lost its conversation.');
      this.announce(event, this.store.aiChats.chat(event.chat_id).profile_id);
      this.store.harnessRecovery.ack(event, 'live-v1');
    }
  }
  private boundSession(chat: AiChatRow): string {
    const id = this.binding(chat).session_id;
    if (id === null) throw new ApiError('conflict', 'This conversation has no native binding.');
    if (this.store.dshSessions.stat(id, chat.profile_id)?.chat_id !== chat.id)
      throw new ApiError('forbidden', 'This native binding belongs to another conversation.');
    return id;
  }
  private validateEvent(event: AiHarnessEvent, grant: HarnessGrant): AiHarnessSession {
    const session = this.store.harnessCoordination.state(event.session_id);
    if (session?.epoch !== event.epoch || session.chat_id !== event.chat_id)
      throw new ApiError('conflict', 'The runtime event belongs to a stale chat or native epoch.');
    const writer = this.store.dshSessions.writerState(event.session_id, grant.profile_id);
    if (writer.claim?.epoch !== event.epoch)
      throw new ApiError('conflict', 'Native projection has no current writer claim.');
    this.store.dshSessions.verifyWriter(
      writer.claim,
      this.hostPrincipal(grant.profile_id, this.directory.get(grant.target).host),
    );
    return session;
  }
  private nextProjection(event: AiHarnessEvent, session: AiHarnessSession): AiHarnessSession {
    return event.kind === 'state'
      ? this.projected(event, session)
      : event.kind === 'interaction'
        ? {
            ...session,
            state: 'waiting' as const,
            interactions: [
              ...session.interactions.filter((entry) => entry.id !== event.interaction.id),
              event.interaction,
            ],
          }
        : event.kind === 'completed'
          ? { ...session, state: 'idle' as const, work: [], reconnecting: false, failure: null }
          : event.kind === 'failed'
            ? { ...session, state: 'failed' as const, failure: event.failure, reconnecting: false }
            : { ...session, state: 'working' as const };
  }
  private projected(
    event: Extract<AiHarnessEvent, { kind: 'state' }>,
    prior: AiHarnessSession,
  ): AiHarnessSession {
    const grant = this.storage.grant(event.session_id);
    if (
      event.session.session_id !== event.session_id ||
      event.session.epoch !== event.epoch ||
      harnessTargetKey(event.session.target) !== harnessTargetKey(grant.target)
    )
      throw new ApiError(
        'forbidden',
        'Native state publication names another session, epoch or execution host.',
      );
    const metadata = this.store.dshSessions.stat(event.session_id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('conflict', 'Native state metadata is unavailable.');
    projectNativeWorkspace(this, event, grant);
    return AI_HARNESS_SESSION.parse({
      ...event.session,
      context: projectHarnessContext(event, prior.context),
      context_request: projectContextRequest(event, prior.context_request),
      metadata,
      target: grant.target,
      route: grant.route,
      permission: grant.permission,
      handoff: prior.handoff,
    });
  }
  hostPrincipal(profileId: string, host: AiHarnessHost): DshSessionPrincipal {
    if (host.manifest === null)
      throw new ApiError('conflict', 'Native composition is unavailable.');
    return {
      profile_id: profileId,
      target: host.target,
      runtime_instance: host.runtime_instance,
      connection_generation: host.connection_generation,
      conversation_authorized: true,
      platform: host.platform,
      composition: host.manifest.composition,
    };
  }
  private admitWork(request: HarnessRuntimeRequest): void {
    if (request.kind === 'close' || request.kind === 'interrupt' || request.kind === 'drain')
      return;
    if (request.kind === 'open') {
      this.store.aiChats.assertWorkAllowed(request.chat_id);
      return;
    }
    const grant = this.store.harnessCoordination.grant(request.session_id);
    if (grant === undefined)
      throw new ApiError('conflict', 'Native work has no admitted session grant.');
    const metadata = this.store.dshSessions.stat(request.session_id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('conflict', 'Native work has no stored conversation.');
    this.store.aiChats.assertWorkAllowed(metadata.chat_id);
  }
  admitTarget(
    owner: ChatOwner,
    host: AiHarnessHost,
    _actorId: string,
    _localClientId?: string,
  ): void {
    if (host.target.kind === 'device' && owner.role !== 'owner')
      throw new ApiError('forbidden', 'Only an authorized owner may start local computer work.');
  }
}
