import { join } from 'node:path';
import { harnessContextPercent } from '@smarteverything/domain';
import { chatFolder, ensureChatFolder } from '../projects/paths';
import { switchConversation } from './switch-conversation';
import { HarnessDiscovery } from './discovery';
import { NativeIngest } from './native-ingest';
import { HarnessSkillUpdatesService } from './skill-updates';
import { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { CountSummary } from '../providers/count-summary';
import { RepeatLog } from '../providers/repeat-log';
import { projectNativeWorkspace } from './workspace-publication';
import { refusedNativeInput } from './input-refusal';
import { logPublished, nextProjection, streamedWithoutChange } from './published-event';
import { HarnessSubscriptions } from './subscriptions';
import { HarnessConfigurationService } from './configuration';
import { HarnessExtensions } from './extensions';
import { prepareConversation } from './preparation';
import { changePermission, confirmedPermission } from './permission';
import { ApiError, AI_HARNESS_SESSION } from '@smarteverything/domain';
import type {
  AiChatRow,
  DshEngine,
  HarnessRuntimeRequest,
  AiModelRouteSelection,
  AiHarnessSession,
  AiHarnessHandoffRequest,
  AiHarnessSwitchResult,
  AiHarnessAnswer,
  AiHarnessHost,
  AiHarnessEvent,
  AiHarnessPermissionChange,
  HarnessNativeFrame,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import { ownedChat, type ChatOwner } from '../assistant/chat-directory';
import type { HarnessAuthority } from '@smarteverything/harness';
import { HarnessDirectory } from './directory';
import { HarnessStorage } from './storage';
import type { HarnessRoutes } from './routes';
import type { DshSessionPrincipal } from '../store/repositories/dsh-session-claims';

export class HarnessService {
  private readonly log = new Logger('hub.harness');
  private readonly events = new CountSummary(this.log, 'harness.events_summary');
  private readonly stale = new RepeatLog(this.log);
  private readonly switching = new Set<string>();
  private readonly listeners = new Set<(event: AiHarnessEvent) => void>();
  readonly directory = new HarnessDirectory((request) => {
    this.admitWork(request);
  });
  private readonly machineListeners = new Set<(chat: AiChatRow, text: string) => void>();
  readonly storage: HarnessStorage;
  readonly configuration: HarnessConfigurationService;
  readonly extensions: HarnessExtensions;
  readonly discovery: HarnessDiscovery;
  readonly skillUpdates: HarnessSkillUpdatesService;
  readonly subscriptions: HarnessSubscriptions;
  private readonly ingest: NativeIngest;
  private readonly dataDirectory: string;
  constructor(
    readonly store: Store,
    readonly routes: HarnessRoutes,
    private readonly announce: (event: AiHarnessEvent, profileId: string) => void,
    options: { readonly dataDirectory: string; readonly clock: Clock },
  ) {
    const now = (): Date => options.clock.now();
    this.dataDirectory = options.dataDirectory;
    this.ingest = new NativeIngest(store, (event) => {
      this.publish(event);
    });
    store.dshSessions.onAppend((sessionId, events) => {
      this.ingest.appended(sessionId, events);
    });
    this.storage = new HarnessStorage(store, this.directory);
    this.subscriptions = new HarnessSubscriptions(this.directory, routes);
    this.configuration = new HarnessConfigurationService(
      store.harnessConfiguration,
      store.harnessExtensions,
      this.directory,
    );
    this.extensions = new HarnessExtensions(
      store.harnessExtensions,
      this.configuration,
      join(options.dataDirectory, 'harness'),
      now,
    );
    this.settleInterruptedSwitches();
    this.discovery = new HarnessDiscovery(() => this.extensions.installed(), now);
    this.skillUpdates = new HarnessSkillUpdatesService(
      store.harnessSkillUpdates,
      this.configuration,
      this.extensions,
      options.clock,
    );
  }
  chatFolder(chatId: string): string {
    return ensureChatFolder(chatFolder(this.dataDirectory, chatId));
  }
  own(owner: ChatOwner, chatId: string): AiChatRow {
    return ownedChat(this.store, owner, chatId);
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
    const fields = {
      chatId,
      harnessSession: id,
      operationId: answer.operation_id,
      interactionId: answer.interaction_id,
    };
    if (receipt.state === 'completed') {
      this.log.debug('harness.answer_replayed', fields);
      return;
    }
    const session = this.state(owner, chatId);
    this.assertPending(session, answer, fields);
    const startedAt = performance.now();
    try {
      await this.directory.execute(session.target, answer.operation_id, {
        kind: 'answer',
        session_id: session.session_id,
        expected_epoch: answer.expected_epoch,
        answer,
      });
    } catch (cause) {
      this.log.error('harness.answer_failed', cause, {
        ...fields,
        durationMs: Math.round(performance.now() - startedAt),
      });
      throw cause;
    }
    this.store.harnessCoordination.finish(answer.operation_id, { ok: true });
    this.log.info('harness.answered', {
      ...fields,
      durationMs: Math.round(performance.now() - startedAt),
    });
  }
  private assertPending(
    session: AiHarnessSession,
    answer: AiHarnessAnswer,
    fields: Record<string, string>,
  ): void {
    if (
      session.epoch === answer.expected_epoch &&
      session.interactions.some((entry) => entry.id === answer.interaction_id)
    )
      return;
    this.log.warn('harness.answer_stale', {
      ...fields,
      expectedEpoch: answer.expected_epoch,
      epoch: session.epoch,
      pending: session.interactions.length,
    });
    throw new ApiError(
      'conflict',
      'This interaction is no longer pending at the selected native epoch.',
    );
  }
  switch(
    owner: ChatOwner,
    chatId: string,
    input: AiHarnessHandoffRequest,
  ): Promise<AiHarnessSwitchResult> {
    const startedAt = performance.now();
    this.log.info('harness.switch_started', { chatId, switching: this.switching.size });
    return switchConversation(this, this.switching, { owner, chatId, input }).then(
      (result) => {
        this.log.info('harness.switch_finished', {
          chatId,
          durationMs: Math.round(performance.now() - startedAt),
        });
        return result;
      },
      (cause: unknown) => {
        this.log.error('harness.switch_failed', cause, {
          chatId,
          durationMs: Math.round(performance.now() - startedAt),
        });
        throw cause;
      },
    );
  }
  private settleInterruptedSwitches(): void {
    for (const id of this.store.harnessCoordination.switchingSessions()) {
      this.log.warn('harness.switch_interrupted', { harnessSession: id });
      this.store.harnessCoordination.settleSwitching(id, {
        code: 'operation_failed',
        message: 'The hub restarted during the machine change; send a message to continue.',
        retry_at: null,
      });
    }
  }
  onMachineChanged(listener: (chat: AiChatRow, text: string) => void): void {
    this.machineListeners.add(listener);
  }
  machineChanged(chat: AiChatRow, text: string): void {
    for (const listener of this.machineListeners) listener(chat, text);
  }
  turnRunning(chat: AiChatRow): boolean {
    return this.store.harnessDeliveries.pending(this.boundSession(chat)).length > 0;
  }
  onEvent(listener: (event: AiHarnessEvent) => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  native(frame: HarnessNativeFrame): void {
    this.ingest.frame(frame);
  }
  publish(event: AiHarnessEvent): void {
    this.events.count(event.kind);
    const grant = this.storage.grant(event.session_id);
    const session = this.validateEvent(event);
    const refusal = refusedNativeInput(this.store, event);
    if (refusal !== undefined) {
      this.log.warn('harness.input_refused', {
        chatId: event.chat_id,
        harnessSession: event.session_id,
        kind: event.kind,
        reason: refusal.message,
      });
      throw refusal;
    }
    logPublished(this.log, event);
    const policy = event.kind === 'state' ? confirmedPermission(this, event) : undefined;
    const next = {
      ...nextProjection(event, session, (state) => this.projected(state, session)),
      ...(policy === undefined ? {} : { permission: policy.permission }),
    };
    const published = event.kind === 'state' ? { ...event, session: next } : event;
    if (!streamedWithoutChange(event, session, next))
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
          this.noteContext(published);
        },
        policy,
      );
    this.deliver(published, grant.profile_id);
  }
  private deliver(event: AiHarnessEvent, profileId: string): void {
    for (const listener of this.listeners) listener(event);
    this.announce(event, profileId);
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
  private boundSession(chat: AiChatRow): string {
    const id = this.binding(chat).session_id;
    if (id === null) throw new ApiError('conflict', 'This conversation has no native binding.');
    if (this.store.dshSessions.stat(id, chat.profile_id)?.chat_id !== chat.id)
      throw new ApiError('forbidden', 'This native binding belongs to another conversation.');
    return id;
  }
  private validateEvent(event: AiHarnessEvent): AiHarnessSession {
    const session = this.store.harnessCoordination.state(event.session_id);
    if (session?.epoch !== event.epoch || session.chat_id !== event.chat_id) {
      this.stale.warn('harness.event_stale', event.session_id, {
        chatId: event.chat_id,
        harnessSession: event.session_id,
        kind: event.kind,
        eventEpoch: event.epoch,
        sessionEpoch: session?.epoch,
        sessionKnown: session !== undefined,
      });
      throw new ApiError('conflict', 'The runtime event belongs to a stale chat or native epoch.');
    }
    return session;
  }
  private projected(
    event: Extract<AiHarnessEvent, { kind: 'state' }>,
    prior: AiHarnessSession,
  ): AiHarnessSession {
    const grant = this.storage.grant(event.session_id);
    const metadata = this.store.dshSessions.stat(event.session_id, grant.profile_id);
    if (metadata === undefined)
      throw new ApiError('conflict', 'Native state metadata is unavailable.');
    projectNativeWorkspace(this, event, grant);
    return AI_HARNESS_SESSION.parse({
      ...event.session,
      context_request: prior.context_request,
      metadata,
      target: grant.target,
      route: grant.route,
      permission: grant.permission,
    });
  }
  hostPrincipal(profileId: string, host: AiHarnessHost): DshSessionPrincipal {
    return {
      profile_id: profileId,
      target: host.target,
      runtime_instance: host.runtime_instance,
      connection_generation: host.connection_generation,
      platform: host.platform,
    };
  }
  private admitWork(request: HarnessRuntimeRequest): void {
    if (request.kind === 'close' || request.kind === 'interrupt') return;
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
  admitTarget(owner: ChatOwner, host: AiHarnessHost): void {
    if (host.target.kind === 'device' && owner.role !== 'owner')
      throw new ApiError('forbidden', 'Only an authorized owner may start local computer work.');
  }
}
