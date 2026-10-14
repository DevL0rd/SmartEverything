import { randomUUID } from 'node:crypto';
import { ApiError, AI_HARNESS_HANDOFF } from '@smarteverything/domain';
import type { AiChatRow, AiHarnessHandoffRequest } from '@smarteverything/domain';
import type { ChatOwner } from '../assistant/chat-directory';
import type { HarnessService } from './service';
import type { HANDOFF_PROGRESS } from './handoff-context';
import type { z } from 'zod';
import type { moveConversation } from './handoff';
export function prepareHandoff(
  service: HarnessService,
  request: {
    readonly owner: ChatOwner;
    readonly chat: AiChatRow;
    readonly input: AiHarnessHandoffRequest;
    readonly localClientId?: string;
    readonly recorded: z.infer<typeof HANDOFF_PROGRESS> | undefined;
  },
): Parameters<typeof moveConversation>[1] {
  const { owner, chat, recorded } = request;
  const input = handoffInput(request.input, recorded);
  const session = recorded?.resume_context?.session ?? service.state(owner, chat.id);
  if (session.epoch !== input.expected_epoch)
    throw new ApiError('conflict', 'The selected native writer epoch changed.');
  service.routes.selected(owner.profileId, input.route, false);
  service.directory.get(input.target);
  const handoff =
    recorded === undefined
      ? AI_HARNESS_HANDOFF.parse({
          id: input.operation_id,
          session_id: session.session_id,
          source: session.target,
          target: input.target,
          source_epoch: input.expected_epoch,
          target_epoch: null,
          mode: input.mode,
          stage: 'preflight',
          waiting: session.work,
          source_outcome: 'pending',
          durable_seq: session.metadata.durable_seq,
          failure: null,
          updated_at: new Date().toISOString(),
        })
      : AI_HARNESS_HANDOFF.parse(recorded);
  const snapshot =
    recorded?.resume_context ??
    service.store.harnessCoordination.retainMove(handoff, {
      chat,
      ...(request.localClientId === undefined ? {} : { local_client_id: request.localClientId }),
      session,
      grant: service.storage.grant(session.session_id),
      controls: { interrupt: randomUUID(), drain: randomUUID(), close: randomUUID() },
    });
  return { owner, session, input, handoff, snapshot };
}

function handoffInput(
  input: AiHarnessHandoffRequest,
  recorded: z.infer<typeof HANDOFF_PROGRESS> | undefined,
): AiHarnessHandoffRequest {
  const epoch = recorded?.resume_context?.session.epoch;
  return epoch === undefined || epoch === null ? input : { ...input, expected_epoch: epoch };
}
