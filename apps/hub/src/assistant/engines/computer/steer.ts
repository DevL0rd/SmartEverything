import { z } from 'zod';
import { ApiError, type AiChatRow, type AssistantReasonCode } from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import { midWorkMessage } from '../../conversation/prompt';
import type { ComputerRunnerDeps, Turn } from './ports';
import type { ProviderState } from './provider-state';
import { steerContent } from './content';

const STEERED = z.strictObject({ steered: z.boolean() });

export interface SteerTarget {
  readonly state: ProviderState;
  readonly turn: Turn | undefined;
  readonly current: () => boolean;
  readonly chat: AiChatRow;
}

export async function steerTurn(
  deps: ComputerRunnerDeps,
  target: SteerTarget,
  event: StoredEvent,
): Promise<boolean> {
  const { turn, chat } = target;
  if (deps.runtime !== 'claude' || turn === undefined) return false;
  const provider = target.state.read(chat);
  if (provider.job_id !== turn.jobId || provider.state !== 'working') return false;
  const content = await steerContent(deps, event, midWorkMessage(event.text));
  const reply = await deps.directory.request(
    provider.device_id,
    { operation: 'provider_steer', job_id: turn.jobId, content },
    STEERED,
  );
  if (!reply.steered) return false;
  if (!target.current())
    throw new ApiError('conflict', 'The reply finished before the message could be added to it.');
  turn.steered.push(event);
  turn.stream.steer(event.message_id);
  deps.conversation.stateOf(event.message_id, 'delivered');
  deps.log.info('computer.steered', { chatId: chat.id, eventId: event.id, jobId: turn.jobId });
  return true;
}

export function settleSteered(
  deps: ComputerRunnerDeps,
  turn: Turn,
  outcome:
    | { readonly ok: true; readonly text: string }
    | { readonly ok: false; readonly reason: string; readonly code: AssistantReasonCode },
): void {
  for (const steered of turn.steered) {
    if (outcome.ok) {
      deps.conversation.stateOf(steered.message_id, 'answered');
      deps.finished(steered, outcome.text, true);
    } else {
      deps.conversation.failedMessage(steered.message_id, outcome.reason, outcome.code);
      deps.finished(steered, outcome.reason, false);
    }
  }
}
