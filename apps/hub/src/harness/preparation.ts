import { acquireNative } from './acquisition';
import { ownSettled } from './permission';
import { randomUUID } from 'node:crypto';
import { ApiError } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessHost,
  AiHarnessInteraction,
  HarnessRuntimeRequest,
  AiModelRouteSelection,
  DshEngine,
} from '@smarteverything/domain';
import type { HarnessAuthority } from '@smarteverything/harness';
import type { ChatOwner } from '../assistant/chat-directory';
import type { DshSessionOpened } from '../store/repositories/dsh-sessions';
import type { HarnessService } from './service';
import type { OpeningBind } from './store-units';
interface Preparation {
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly authority: HarnessAuthority;
  readonly localClientId: string | undefined;
  readonly cwd?: string;
  readonly interactions?: readonly AiHarnessInteraction[];
}
export async function prepareConversation(
  service: HarnessService,
  request: Preparation,
): Promise<Extract<HarnessRuntimeRequest, { kind: 'open' }>> {
  const chat = await ownSettled(service, request.owner, request.chatId);
  service.store.live.chatWork.assertWorkAllowed(chat.id);
  const binding = service.binding(chat);
  const connection = service.directory.get(binding.execution_target);
  if (connection.host.manifest === null)
    throw new ApiError('conflict', 'The execution host has not reported its native runtime yet.');
  const selection = service.selection(chat);
  service.routes.selected(chat.profile_id, selection, request.authority.kind === 'trigger');
  const { id, cwd } = await openingLocation(service, {
    chat,
    host: connection.host,
    cwd: request.cwd,
  });
  const opened = await acquireNative(service, chat, connection.host, { id, cwd });
  await bindOpening(service, { request, chat, host: connection.host, opened, selection, id, cwd });
  return {
    kind: 'open',
    chat_id: chat.id,
    claim: opened.claim,
    route: selection,
    permission: binding.permission,
    cwd,
    mode: opened.metadata.next_seq === 0 ? 'create' : 'resume',
    ...(request.interactions === undefined || request.interactions.length === 0
      ? {}
      : { interactions: [...request.interactions] }),
  };
}
async function openingLocation(
  service: HarnessService,
  input: {
    readonly chat: AiChatRow;
    readonly host: AiHarnessHost;
    readonly cwd: string | undefined;
  },
): Promise<{ readonly id: string; readonly cwd: string }> {
  const id = service.binding(input.chat).session_id ?? randomUUID();
  if (input.host.target.kind === 'server') return { id, cwd: service.chatFolder(input.chat) };
  return { id, cwd: input.cwd ?? (await workspace(service, input.chat, input.host, id)) };
}
function openingGrant(
  { request, chat, host, selection, id, cwd }: Opening,
  permission: DshEngine['permission'],
): OpeningBind['grant'] {
  return {
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
    permission,
    cwd,
  };
}
interface Opening {
  readonly request: Preparation;
  readonly chat: AiChatRow;
  readonly host: AiHarnessHost;
  readonly opened: DshSessionOpened;
  readonly selection: AiModelRouteSelection;
  readonly id: string;
  readonly cwd: string;
}
async function bindOpening(service: HarnessService, input: Opening): Promise<void> {
  const { request, chat, host, opened, selection, id, cwd } = input;
  const binding = service.binding(chat);
  const route = service.routes.selected(
    chat.profile_id,
    selection,
    request.authority.kind === 'trigger',
  );
  const model = route.models.find((entry) => entry.id === selection.model);
  if (model === undefined)
    throw new ApiError('conflict', 'Native reopening lost its selected model.');
  await service.store.host.write('harnessOpeningBind', {
    chat_id: chat.id,
    engine: { ...binding, session_id: opened.metadata.header.id },
    grant: openingGrant(input, binding.permission),
    capacity: model.capabilities.context_tokens,
    projection: {
      chat_id: chat.id,
      session_id: opened.metadata.header.id,
      metadata: opened.metadata,
      target: host.target,
      epoch: opened.claim.epoch,
      directory: { target: host.target, path: cwd },
      permission: binding.permission,
      route: selection,
      state: 'idle',
      interactions: [],
      work: [],
      failure: null,
    },
  });
  await service.sessions.refresh(id);
}
async function workspace(
  service: HarnessService,
  chat: AiChatRow,
  host: AiHarnessHost,
  id: string,
): Promise<string> {
  if (host.target.kind === 'server') return service.chatFolder(chat);
  const binding = service.binding(chat);
  const cwd =
    (binding.session_id === null
      ? undefined
      : (
          await service.store.host.call(
            'dshSessions',
            'workspace',
            id,
            host.target,
            chat.profile_id,
          )
        )?.cwd) ??
    host.workspace?.default_directory ??
    host.workspace?.home_directory;
  if (cwd === undefined)
    throw new ApiError(
      'conflict',
      'The target host must resolve its own valid workspace before opening.',
    );
  return cwd;
}
