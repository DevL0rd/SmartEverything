import type { HubLayout } from '../data-layout';
import { chatFolder, ensureChatFolder } from '../projects/paths';
import { switchConversation } from './switch-conversation';
import { HarnessDiscovery } from './discovery';
import { HarnessSourceRegistry } from './sources';
import { NativeIngest } from './native-ingest';
import { DshUsageLedger } from './dsh-usage';
import { HarnessSkillUpdatesService } from './skill-updates';
import { Logger } from '@smarteverything/logging';
import type { Clock } from '../clock';
import { CountSummary } from '../providers/count-summary';
import { RepeatLog } from '../providers/repeat-log';
import { refusalOf } from './input-refusal';
import { logPublished, nextProjection, streamedWithoutChange } from './published-event';
import { HarnessSubscriptions } from './subscriptions';
import { HarnessConfigurationService } from './configuration';
import { HarnessExtensions } from './extensions';
import { prepareConversation } from './preparation';
import { changePermission, confirmedPermission } from './permission';
import { ApiError, AI_HARNESS_SESSION, harnessTargetKey } from '@smarteverything/domain';
import type { EventInputs, WorkspaceChange } from './store-units';
import type { HarnessGrant } from './grant';
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
  DshSessionMetadata,
} from '@smarteverything/domain';
import type { Store } from '../store/store';
import type { ChatOwner } from '../assistant/chat-ownership';
import type { HarnessAuthority } from '@smarteverything/harness';
import { HarnessDirectory } from './directory';
import { HarnessStorage } from './storage';
import type { StoredSessionLog } from './workspace-routes';
import { HarnessSessionMirror } from './session-mirror';
import { answerInteraction } from './answer';
import { admitChildRoutes } from './child-routes';
import type { HarnessRoutes } from './routes';
import type { DshSessionPrincipal } from '../store/repositories/dsh-session-claims';
import { HarnessExtensionRows } from './extension-rows';
import {
  hostHarnessConfiguration,
  hostSkillUpdates,
  hostSubscriptionHistory,
} from '../store/host/hosted';

export class HarnessService {
  private readonly log = new Logger('hub.harness');
  private readonly events = new CountSummary(this.log, 'harness.events_summary');
  private readonly stale = new RepeatLog(this.log);
  private readonly switching = new Set<string>();
  private readonly listeners = new Set<(event: AiHarnessEvent) => unknown>();
  readonly directory = new HarnessDirectory((request) => this.admitWork(request));
  private readonly machineListeners = new Set<(chat: AiChatRow, text: string) => void>();
  readonly storage: HarnessStorage;
  readonly sessions: HarnessSessionMirror;
  readonly configuration: HarnessConfigurationService;
  private readonly extensionRows: HarnessExtensionRows;
  readonly extensions: HarnessExtensions;
  readonly discovery: HarnessDiscovery;
  readonly sources: HarnessSourceRegistry;
  readonly skillUpdates: HarnessSkillUpdatesService;
  readonly subscriptions: HarnessSubscriptions;
  readonly dshUsage: DshUsageLedger;
  private readonly ingest: NativeIngest;
  private readonly layout: HubLayout;
  constructor(
    readonly store: Store,
    readonly routes: HarnessRoutes,
    private readonly announce: (event: AiHarnessEvent, profileId: string) => void,
    options: { readonly layout: HubLayout; readonly clock: Clock },
  ) {
    this.layout = options.layout;
    this.ingest = new NativeIngest(store, (event) => this.publish(event));
    this.dshUsage = new DshUsageLedger({
      amend: (id, change): Promise<unknown> => store.host.write('ledgerAmend', { id, change }),
    });
    store.live.dshSessions.onAppend((sessionId, events) => {
      this.ingest.appended(sessionId, events);
      this.dshUsage.appended(sessionId, events);
    });
    admitChildRoutes(this);
    this.storage = new HarnessStorage(store, this.directory);
    this.sessions = new HarnessSessionMirror(store);
    this.subscriptions = new HarnessSubscriptions(
      this.directory,
      routes,
      hostSubscriptionHistory(store.host),
      () => store.host.call('computerNodes', 'activeDeviceIds'),
    );
    this.extensionRows = new HarnessExtensionRows(store.host);
    this.configuration = new HarnessConfigurationService(
      hostHarnessConfiguration(store.host),
      this.extensionRows,
      this.directory,
    );
    this.extensions = new HarnessExtensions(
      this.extensionRows,
      this.configuration,
      { state: options.layout.system.ai.harness, tmp: options.layout.tmp },
      (): Date => options.clock.now(),
    );
    this.sources = new HarnessSourceRegistry(store.live.home.saved);
    this.discovery = new HarnessDiscovery(
      () => this.extensions.installed(),
      () => this.sources.list().sources.map((entry) => entry.source),
      options.layout.tmp,
      (): Date => options.clock.now(),
    );
    this.skillUpdates = new HarnessSkillUpdatesService(
      hostSkillUpdates(store.host),
      this.configuration,
      this.extensions,
      options.clock,
    );
  }
  async start(): Promise<void> {
    await this.store.host.write('harnessRestartSettle', null);
    await this.extensionRows.load();
    await this.configuration.load();
  }
  sessionLog(sessionId: string, profileId: string): Promise<StoredSessionLog | null> {
    return this.store.host.read('harnessSessionLog', {
      session_id: sessionId,
      profile_id: profileId,
    });
  }
  chatFolder(chat: AiChatRow): string {
    return chatFolder(this.layout, chat);
  }
  async readyFolder(open: Extract<HarnessRuntimeRequest, { kind: 'open' }>): Promise<void> {
    if (open.claim.target.kind === 'server') await ensureChatFolder(open.cwd);
  }
  own(owner: ChatOwner, chatId: string): Promise<AiChatRow> {
    return this.store.host.read('assistantOwnedChat', { owner, chatId });
  }
  binding(chat: AiChatRow): DshEngine {
    if (chat.engine.kind !== 'dsh')
      throw new ApiError('conflict', 'This chat has a different native engine boundary.');
    return chat.engine;
  }
  async state(owner: ChatOwner, chatId: string): Promise<AiHarnessSession> {
    const chat = await this.own(owner, chatId);
    const binding = this.binding(chat);
    if (binding.session_id === null)
      throw new ApiError(
        'conflict',
        'This native chat has not been opened on its selected execution host.',
      );
    const view = await this.store.host.read('harnessSessionView', {
      session_id: binding.session_id,
      profile_id: chat.profile_id,
    });
    const { state, metadata } = view;
    if (state === undefined)
      throw new ApiError('conflict', 'Native session projection is unavailable.');
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
      permission_change: view.permission_change,
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
  ): Promise<Extract<HarnessRuntimeRequest, { kind: 'open' }>> {
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
  answer(owner: ChatOwner, chatId: string, answer: AiHarnessAnswer): Promise<void> {
    return answerInteraction(this, { owner, chatId, answer });
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
  onMachineChanged(listener: (chat: AiChatRow, text: string) => void): void {
    this.machineListeners.add(listener);
  }
  machineChanged(chat: AiChatRow, text: string): void {
    for (const listener of this.machineListeners) listener(chat, text);
  }
  turnRunning(chat: AiChatRow): Promise<boolean> {
    return this.store.host.read('harnessTurnRunning', {
      session_id: this.boundId(chat),
      profile_id: chat.profile_id,
      chat_id: chat.id,
    });
  }
  onEvent(listener: (event: AiHarnessEvent) => unknown): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
  native(frame: HarnessNativeFrame): Promise<void> {
    return this.ingest.frame(frame);
  }
  ingested(): Promise<void> {
    return this.ingest.settled();
  }
  async publish(event: AiHarnessEvent): Promise<void> {
    this.events.count(event.kind);
    const inputs = await this.store.host.read('harnessEventInputs', event);
    const { grant } = inputs;
    const session = this.validateEvent(event, inputs.session);
    const refusal = refusalOf(inputs.refusal);
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
    const policy =
      event.kind === 'state' ? confirmedPermission(event, inputs.permission) : undefined;
    const workspace =
      event.kind === 'state' ? this.workspaceChange(event, grant, inputs) : undefined;
    const next = {
      ...nextProjection(event, session, (state) => this.projected(state, grant, inputs.metadata)),
      ...(policy === undefined ? {} : { permission: policy.permission }),
    };
    const published = event.kind === 'state' ? { ...event, session: next } : event;
    const accept = !streamedWithoutChange(event, session, next);
    if (accept || workspace !== undefined)
      await this.store.host.write('harnessEventAccept', {
        next,
        published,
        accept,
        policy,
        workspace,
      });
    await this.deliver(published, grant.profile_id);
  }
  private workspaceChange(
    event: Extract<AiHarnessEvent, { kind: 'state' }>,
    grant: HarnessGrant,
    inputs: EventInputs,
  ): WorkspaceChange | undefined {
    const directory = event.session.directory;
    if (directory === null || inputs.workspace === directory.path) return undefined;
    if (harnessTargetKey(directory.target) !== harnessTargetKey(grant.target))
      throw new ApiError('forbidden', 'Native workspace publication belongs to another host.');
    if (inputs.claim === null)
      throw new ApiError('conflict', 'Native workspace has no current writer.');
    return {
      claim: inputs.claim,
      cwd: directory.path,
      principal: this.hostPrincipal(grant.profile_id, this.directory.get(grant.target).host),
      grant,
    };
  }
  private async deliver(event: AiHarnessEvent, profileId: string): Promise<void> {
    for (const listener of this.listeners) await listener(event);
    this.announce(event, profileId);
  }
  boundId(chat: AiChatRow): string {
    const id = this.binding(chat).session_id;
    if (id === null) throw new ApiError('conflict', 'This conversation has no native binding.');
    return id;
  }
  private validateEvent(
    event: AiHarnessEvent,
    session: AiHarnessSession | undefined,
  ): AiHarnessSession {
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
    grant: HarnessGrant,
    metadata: DshSessionMetadata | undefined,
  ): AiHarnessSession {
    if (metadata === undefined)
      throw new ApiError('conflict', 'Native state metadata is unavailable.');
    return AI_HARNESS_SESSION.parse({
      ...event.session,
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
  private async admitWork(request: HarnessRuntimeRequest): Promise<void> {
    if (request.kind === 'close') {
      this.sessions.forget(request.session_id);
      return;
    }
    if (request.kind === 'interrupt') return;
    if (request.kind === 'open') {
      this.store.live.chatWork.assertWorkAllowed(request.chat_id);
      return;
    }
    this.store.live.chatWork.assertWorkAllowed(
      await this.store.host.read('harnessWorkChat', request.session_id),
    );
    await this.sessions.refresh(request.session_id);
  }
  admitTarget(owner: ChatOwner, host: AiHarnessHost): void {
    if (host.target.kind === 'device' && owner.role !== 'owner')
      throw new ApiError('forbidden', 'Only an authorized owner may start local computer work.');
  }
}
