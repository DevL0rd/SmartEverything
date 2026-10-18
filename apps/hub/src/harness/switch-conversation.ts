import { ApiError } from '@smarteverything/domain';
import type {
  AiChatRow,
  AiHarnessHandoffRequest,
  AiHarnessSwitchResult,
  DshEngine,
} from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import { moveConversation, sameTarget } from './machine-move';
import { noteMachineChange } from './pending-machine';
import type { HarnessService } from './service';

interface SwitchRequest {
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly input: AiHarnessHandoffRequest;
}

export async function switchConversation(
  service: HarnessService,
  switching: Set<string>,
  request: SwitchRequest,
): Promise<AiHarnessSwitchResult> {
  const chat = service.own(request.owner, request.chatId);
  if (service.binding(chat).session_id === null)
    throw new ApiError('conflict', 'This conversation has no native binding.');
  if (switching.has(chat.id))
    throw new ApiError('conflict', 'A machine change for this chat is already in progress.');
  switching.add(chat.id);
  try {
    return await decide(service, request, chat);
  } finally {
    switching.delete(chat.id);
  }
}

async function decide(
  service: HarnessService,
  request: SwitchRequest,
  chat: AiChatRow,
): Promise<AiHarnessSwitchResult> {
  const { input } = request;
  const binding = service.binding(chat);
  const here = sameTarget(binding.execution_target, input.target);
  const reselect = here && sameSelection(binding, input) && input.directory === undefined;
  if (reselect) return clearPending(service, chat);
  service.admitTarget(request.owner, service.directory.get(input.target).host);
  if (service.turnRunning(chat)) return queue(service, request, chat);
  await moveNow(service, request, chat);
  return result(service, chat.id, 'applied');
}

function sameSelection(binding: DshEngine, input: AiHarnessHandoffRequest): boolean {
  return (
    binding.model_route_id === input.route.route_id &&
    binding.model === input.route.model &&
    binding.effort === input.route.effort
  );
}

function clearPending(service: HarnessService, chat: AiChatRow): AiHarnessSwitchResult {
  if (chat.pending_execution_target === null) return result(service, chat.id, 'applied');
  service.store.aiChats.setPendingTarget(chat.id, null);
  return result(service, chat.id, 'cleared');
}

function queue(
  service: HarnessService,
  request: SwitchRequest,
  chat: AiChatRow,
): AiHarnessSwitchResult {
  const { input } = request;
  if (input.directory !== undefined || !sameSelection(service.binding(chat), input))
    throw new ApiError('conflict', 'Wait for the reply to finish to change the model or folder.');
  service.store.aiChats.setPendingTarget(chat.id, input.target);
  return result(service, chat.id, 'pending');
}

async function moveNow(
  service: HarnessService,
  request: SwitchRequest,
  chat: AiChatRow,
): Promise<void> {
  const { owner, input } = request;
  const session = service.state(owner, chat.id);
  const outcome = await moveConversation(service, {
    owner,
    chat,
    session,
    grant: service.storage.grant(session.session_id),
    target: input.target,
    route: input.route,
    directory: input.directory,
    interrupt: false,
  });
  service.store.aiChats.setPendingTarget(chat.id, null);
  if (outcome.state !== 'moved') throw new ApiError('conflict', outcome.reason);
  await noteMachineChange(service, chat.id, outcome.note);
}

function result(
  service: HarnessService,
  chatId: string,
  state: AiHarnessSwitchResult['state'],
): AiHarnessSwitchResult {
  const chat = service.store.aiChats.chat(chatId);
  return {
    state,
    execution_target: service.binding(chat).execution_target,
    pending_execution_target: chat.pending_execution_target,
  };
}
