import { AI_HARNESS_HANDOFF, ApiError } from '@smarteverything/domain';
import type { AiHarnessHandoff, AiHarnessHandoffRequest } from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessService } from './service';
import { stableHumanSession } from './stable-session';
import { HANDOFF_PROGRESS } from './handoff-context';
import { prepareHandoff } from './handoff-admission';
import { moveConversation } from './handoff';
interface SwitchRequest {
  readonly owner: ChatOwner;
  readonly chatId: string;
  readonly input: AiHarnessHandoffRequest;
  readonly localClientId: string | undefined;
}
async function currentInput(
  service: HarnessService,
  request: SwitchRequest,
): Promise<AiHarnessHandoffRequest> {
  const { owner, chatId, input, localClientId } = request;
  if (
    service.store.harnessCoordination.operation(input.operation_id) !== undefined ||
    localClientId === undefined ||
    input.mode === 'recover'
  )
    return input;
  const session = await stableHumanSession(
    service,
    { owner, chatId, clientId: localClientId },
    input.expected_epoch,
  );
  if (session.epoch === null)
    throw new ApiError('conflict', 'The refreshed native writer has no epoch.');
  return { ...input, expected_epoch: session.epoch };
}
export async function switchConversation(
  service: HarnessService,
  switching: Map<string, Promise<AiHarnessHandoff>>,
  request: SwitchRequest,
): Promise<AiHarnessHandoff> {
  const { owner, chatId, input, localClientId } = request;
  const effective = await currentInput(service, request);
  const chat = service.own(owner, chatId);
  const id = service.binding(chat).session_id;
  if (id === null) throw new ApiError('conflict', 'This conversation has no native binding.');
  const receipt = service.store.harnessCoordination.begin(input.operation_id, id, input);
  if (receipt.state === 'completed' || receipt.state === 'unknown') {
    if (receipt.result === null)
      throw new ApiError('conflict', 'A settled handoff is missing its durable receipt.');
    return AI_HARNESS_HANDOFF.parse(JSON.parse(receipt.result));
  }
  service.admitSwitch(chat, input.operation_id);
  const pending = switching.get(input.operation_id);
  if (pending !== undefined) return pending;
  const recorded =
    receipt.result === null ? undefined : HANDOFF_PROGRESS.parse(JSON.parse(receipt.result));
  if (recorded?.stage === 'completed') {
    const completed = AI_HARNESS_HANDOFF.parse(recorded);
    service.store.harnessCoordination.finish(input.operation_id, completed);
    return completed;
  }
  const move = prepareHandoff(service, {
    owner,
    chat,
    input: effective,
    recorded,
    ...(localClientId === undefined ? {} : { localClientId }),
  });
  service.store.harnessCoordination.handoff(move.handoff);
  const result = Promise.resolve()
    .then(() => moveConversation(service, move))
    .finally(() => {
      switching.delete(input.operation_id);
    });
  switching.set(input.operation_id, result);
  return result;
}
