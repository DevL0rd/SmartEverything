import { pluginChildPolicy } from './plugin-agents';
import { legacyHistory } from './legacy-history';
import { acquireNative } from './acquisition';
import { ownSettled } from './permission';
import { randomUUID } from 'node:crypto';
import { ApiError, AI_HARNESS_SESSION } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessHost,
  AiHarnessInteraction,
  AiHarnessSession,
  HarnessRuntimeRequest,
  AiModelRouteSelection,
} from '@smarteverything/domain';
import type { HarnessAuthority } from '@smarteverything/harness';
import type { ChatOwner } from '../assistant/chat-directory';
import type { DshSessionOpened } from '../store/repositories/dsh-sessions';
import type { HarnessService } from './service';
function compatibleHarnessContext(
  context: AiHarnessSession['context'],
  selection: AiModelRouteSelection,
  capacity: number | null,
): AiHarnessSession['context'] {
  if (context === undefined) return undefined;
  return context.provider === selection.route_id &&
    context.model === selection.model &&
    (capacity === null || context.capacity_tokens === capacity)
    ? context
    : undefined;
}
interface Preparation {
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly authority: HarnessAuthority;
  readonly localClientId: string | undefined;
  readonly cwd?: string;
  readonly interactions?: readonly AiHarnessInteraction[];
}
export function prepareConversation(
  service: HarnessService,
  request: Preparation,
): Extract<HarnessRuntimeRequest, { kind: 'open' }> {
  const chat = ownSettled(service, request.owner, request.chatId);
  service.store.aiChats.assertWorkAllowed(chat.id);
  const binding = service.binding(chat);
  const connection = service.directory.get(binding.execution_target);
  if (connection.host.manifest === null)
    throw new ApiError('conflict', 'The execution host has not reported its native runtime yet.');
  const history = legacyHistory(service, chat);
  const selection = service.selection(chat);
  service.routes.selected(chat.profile_id, selection, request.authority.kind === 'trigger');
  const { id, cwd } = openingLocation(service, { chat, host: connection.host, cwd: request.cwd });
  const opened = acquireNative(service, chat, connection.host, { id, cwd });
  bindOpening(service, { request, chat, host: connection.host, opened, selection, id, cwd });
  return {
    kind: 'open',
    ...childOpeningPolicy(service, chat),
    chat_id: chat.id,
    claim: opened.claim,
    route: selection,
    permission: binding.permission,
    cwd,
    mode: opened.metadata.next_seq === 0 ? 'create' : 'resume',
    ...(history.length === 0 ? {} : { history_import: [...history] }),
    ...(request.interactions === undefined || request.interactions.length === 0
      ? {}
      : { interactions: [...request.interactions] }),
  };
}
function openingLocation(
  service: HarnessService,
  input: {
    readonly chat: AiChatRow;
    readonly host: AiHarnessHost;
    readonly cwd: string | undefined;
  },
): { readonly id: string; readonly cwd: string } {
  const id = service.binding(input.chat).session_id ?? randomUUID();
  if (input.host.target.kind === 'server') return { id, cwd: service.chatFolder(input.chat.id) };
  return { id, cwd: input.cwd ?? workspace(service, input.chat, input.host, id) };
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
  service.store.harnessCoordination.issue({
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
  });
  projectOpened(service, opened, { chat, host: host, selection, cwd });
}
function workspace(
  service: HarnessService,
  chat: AiChatRow,
  host: AiHarnessHost,
  id: string,
): string {
  if (host.target.kind === 'server') return service.chatFolder(chat.id);
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
function projectOpened(
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
      permission: service.binding(input.chat).permission,
      route: input.selection,
      state: 'idle',
      interactions: [],
      work: [],
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
