import { compatibleHarnessContext } from './context-projection';
import { issueProjectGrant } from './project-grant';
import { pluginChildPolicy } from './plugin-agents';
import { projectBinding } from './project-binding';
import { legacyHistory, admitLegacyImport } from './legacy-history';
import { acquireNative } from './acquisition';
import { recoverPermission } from './permission-recovery';
import { randomUUID } from 'node:crypto';
import { ApiError, AI_HARNESS_SESSION } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessHost,
  HarnessRuntimeRequest,
  AiModelRouteSelection,
} from '@smarteverything/domain';
import type { HarnessAuthority } from '@smarteverything/harness';
import type { ChatOwner } from '../assistant/chat-directory';
import type { DshSessionOpened } from '../store/repositories/dsh-sessions';
import type { HarnessService } from './service';
interface Preparation {
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly authority: HarnessAuthority;
  readonly localClientId: string | undefined;
  readonly cwd?: string;
  readonly explicitWorkspace?: boolean;
}
export function prepareConversation(
  service: HarnessService,
  request: Preparation,
): Extract<HarnessRuntimeRequest, { kind: 'open' }> {
  const owned = service.own(request.owner, request.chatId);
  service.store.aiChats.assertWorkAllowed(owned.id);
  recoverPermission(service, owned);
  const chat = service.own(request.owner, request.chatId);
  if (
    chat.engine.kind === 'dsh' &&
    chat.engine.session_id !== null &&
    service.store.harnessCoordination.permissionChange(chat.engine.session_id) !== null
  )
    throw new ApiError(
      'conflict',
      'Confirm the pending native permission operation before reopening this session.',
    );
  const binding = service.binding(chat);
  const connection = service.directory.get(binding.execution_target);
  service.admitTarget(request.owner, connection.host, connection.actor.id, request.localClientId);
  admitLegacyImport(service, chat);
  const history = legacyHistory(service, chat);
  const selection = service.selection(chat);
  service.routes.selected(chat.profile_id, selection, request.authority.kind === 'trigger');
  admitPermission(service, chat, connection.host);
  const { id, cwd, signature } = openingLocation(service, {
    chat,
    host: connection.host,
    selection,
    cwd: request.cwd,
  });
  const retry = retryOpening(service, chat, connection.host, signature);
  if (retry !== undefined) return retry;
  const opened = acquireNative(service, chat, connection.host, { id, cwd, signature });
  bindOpening(service, { request, chat, host: connection.host, opened, selection, id, cwd });
  const opening: Extract<HarnessRuntimeRequest, { kind: 'open' }> = {
    kind: 'open',
    ...childOpeningPolicy(service, chat),
    chat_id: chat.id,
    claim: opened.claim,
    route: selection,
    permission: binding.permission,
    cwd,
    storage_binding: service.storage.grant(id).storage_binding,
    mode: opened.metadata.next_seq === 0 ? 'create' : 'resume',
    ...(history.length === 0 ? {} : { history_import: [...history] }),
  };
  service.store.harnessRecovery.opened(chat.id, signature, opening);
  return opening;
}
function openingLocation(
  service: HarnessService,
  input: {
    readonly chat: AiChatRow;
    readonly host: AiHarnessHost;
    readonly selection: AiModelRouteSelection;
    readonly cwd: string | undefined;
  },
): { readonly id: string; readonly cwd: string; readonly signature: string } {
  const binding = service.binding(input.chat);
  const admission = service.store.harnessRecovery.nativeAdmission(input.chat.id);
  const inheritedId =
    admission === undefined
      ? randomUUID()
      : 'header' in admission.request
        ? admission.request.header.id
        : admission.request.session_id;
  const id = binding.session_id ?? inheritedId;
  const cwd = input.cwd ?? workspace(service, input.chat, input.host, id);
  const signature = JSON.stringify({
    profile: input.chat.profile_id,
    target: input.host.target,
    instance: input.host.runtime_instance,
    generation: input.host.connection_generation,
    selection: input.selection,
    permission: binding.permission,
    cwd,
    storage_binding: projectBinding(service, input.chat, input.host, { cwd, explicit: false }),
  });
  return { id, cwd, signature };
}
function retryOpening(
  service: HarnessService,
  chat: AiChatRow,
  host: AiHarnessHost,
  signature: string,
): Extract<HarnessRuntimeRequest, { kind: 'open' }> | undefined {
  const prior = service.store.harnessRecovery.opening(chat.id);
  if (prior?.signature !== signature || prior.state === 'failed' || prior.request.kind !== 'open')
    return undefined;
  const writer = service.store.dshSessions.writerState(
    prior.request.claim.session_id,
    chat.profile_id,
  );
  if (
    writer.state !== 'active' ||
    writer.claim?.epoch !== prior.request.claim.epoch ||
    Date.parse(writer.claim.expires_at) <= Date.now()
  )
    return undefined;
  service.store.dshSessions.verifyWriter(
    writer.claim,
    service.hostPrincipal(chat.profile_id, host),
  );
  return { ...prior.request, claim: writer.claim };
}
function bindOpening(
  service: HarnessService,
  input: {
    readonly request: Preparation;
    readonly chat: AiChatRow;
    readonly host: AiHarnessHost;
    readonly opened: DshSessionOpened;
    readonly selection: AiModelRouteSelection;
    readonly id: string;
    readonly cwd: string;
  },
): void {
  const { request, chat, host, opened, selection, id, cwd } = input;
  const binding = service.binding(chat);
  service.store.aiChats.update(chat.id, {
    engine: { ...binding, session_id: opened.metadata.header.id },
  });
  issueProjectGrant(service.store, {
    client_id: request.localClientId ?? null,
    event_id: request.authority.kind === 'trigger' ? request.authority.grantId : null,
    role: request.owner.role,
    session_id: id,
    profile_id: chat.profile_id,
    target: host.target,
    runtime_instance: host.runtime_instance,
    generation: host.connection_generation,
    authority: request.authority,
    route: selection,
    permission: binding.permission,
    cwd,
    storage_binding: projectBinding(service, chat, host, {
      cwd,
      explicit: request.explicitWorkspace === true,
    }),
  });
  projectOpened(service, opened, { chat, host: host, selection, cwd });
}
function admitPermission(service: HarnessService, chat: AiChatRow, host: AiHarnessHost): void {
  const binding = service.binding(chat);
  if (host.manifest === null)
    throw new ApiError(
      'conflict',
      'The execution host has not installed a compatible native composition.',
    );
  if (
    !host.manifest.permissions.some(
      (policy) =>
        policy.sandbox === binding.permission.sandbox &&
        policy.approval === binding.permission.approval,
    )
  )
    throw new ApiError(
      'conflict',
      'The selected permission policy is unavailable on this execution host.',
    );
}
function workspace(
  service: HarnessService,
  chat: AiChatRow,
  host: AiHarnessHost,
  id: string,
): string {
  const binding = service.binding(chat);
  const cwd =
    (binding.session_id === null
      ? undefined
      : service.store.dshSessions.workspace(id, host.target, chat.profile_id)?.cwd) ??
    host.workspace?.default_directory ??
    host.workspace?.home_directory;
  if (cwd === undefined)
    throw new ApiError(
      'conflict',
      'The target host must resolve its own valid workspace before opening.',
    );
  return cwd;
}
export function projectOpened(
  service: HarnessService,
  opened: DshSessionOpened,
  input: {
    readonly chat: AiChatRow;
    readonly host: AiHarnessHost;
    readonly selection: AiModelRouteSelection;
    readonly cwd: string;
  },
): void {
  const grant = service.storage.grant(opened.metadata.header.id);
  const route = service.routes.selected(
    input.chat.profile_id,
    input.selection,
    grant.authority.kind === 'trigger',
  );
  const model = route.models.find((entry) => entry.id === input.selection.model);
  if (model === undefined)
    throw new ApiError('conflict', 'Native reopening lost its selected model.');
  const retained = service.store.harnessCoordination.state(opened.metadata.header.id)?.context;
  const context = compatibleHarnessContext(
    retained,
    input.selection,
    model.capabilities.context_tokens,
  );
  service.store.harnessCoordination.project(
    AI_HARNESS_SESSION.parse({
      chat_id: input.chat.id,
      session_id: opened.metadata.header.id,
      metadata: opened.metadata,
      context,
      target: input.host.target,
      epoch: opened.claim.epoch,
      directory: { target: input.host.target, path: input.cwd },
      storage_binding: grant.storage_binding,
      permission: service.binding(input.chat).permission,
      route: input.selection,
      state: 'idle',
      interactions: [],
      work: [],
      handoff: null,
      failure: null,
    }),
    0,
  );
}

function childOpeningPolicy(
  service: HarnessService,
  chat: AiChatRow,
): Pick<Extract<HarnessRuntimeRequest, { kind: 'open' }>, 'plugin_agent_policy'> {
  const policy = pluginChildPolicy(service, chat);
  return policy === undefined ? {} : { plugin_agent_policy: policy };
}
