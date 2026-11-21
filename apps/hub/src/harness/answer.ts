import { ApiError } from '@smarteverything/domain';
import type { AiHarnessAnswer, AiHarnessSession } from '@smarteverything/domain';
import { Logger } from '@smarteverything/logging';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessService } from './service';

const log = new Logger('hub.harness');

function assertPending(
  session: AiHarnessSession,
  answer: AiHarnessAnswer,
  fields: Record<string, string>,
): void {
  if (
    session.epoch === answer.expected_epoch &&
    session.interactions.some((entry) => entry.id === answer.interaction_id)
  )
    return;
  log.warn('harness.answer_stale', {
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

export async function answerInteraction(
  service: HarnessService,
  {
    owner,
    chatId,
    answer,
  }: { readonly owner: ChatOwner; readonly chatId: string; readonly answer: AiHarnessAnswer },
): Promise<void> {
  const chat = await service.own(owner, chatId);
  const id = service.boundId(chat);
  const receipt = await service.store.host.write('harnessBoundOperation', {
    session_id: id,
    profile_id: chat.profile_id,
    chat_id: chat.id,
    operation_id: answer.operation_id,
    request: answer,
  });
  const fields = {
    chatId,
    harnessSession: id,
    operationId: answer.operation_id,
    interactionId: answer.interaction_id,
  };
  if (receipt.state === 'completed') {
    log.debug('harness.answer_replayed', fields);
    return;
  }
  const session = await service.state(owner, chatId);
  assertPending(session, answer, fields);
  const startedAt = performance.now();
  try {
    await service.directory.execute(session.target, answer.operation_id, {
      kind: 'answer',
      session_id: session.session_id,
      expected_epoch: answer.expected_epoch,
      answer,
    });
  } catch (cause) {
    log.error('harness.answer_failed', cause, {
      ...fields,
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw cause;
  }
  await service.store.host.call('harnessSessions', 'finish', answer.operation_id, { ok: true });
  log.info('harness.answered', {
    ...fields,
    durationMs: Math.round(performance.now() - startedAt),
  });
}
