import { background, messageOf } from '@smarteverything/logging';
import { z } from 'zod';
import { ApiError, type AiChatRow, type AssistantReasonCode } from '@smarteverything/domain';
import type { StoredEvent } from '../../../store/repositories/assistant-events';
import { midWorkMessage } from '../../conversation/prompt';
import type { ComputerRunnerDeps, Turn } from './ports';
import type { ProviderState } from './provider-state';
import { helperParentMessageId } from '../../delegation/helper-dialogue';
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
  if (deps.runtime !== 'claude' || turn === undefined || event.message_id === null) return false;
  if (helperParentMessageId(event) !== null || helperParentMessageId(turn.event) !== null)
    return false;
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
  await deps.conversation.stateOf(event.message_id, 'delivered');
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
    const written = outcome.ok
      ? deps.conversation.stateOf(steered.message_id, 'answered')
      : deps.conversation.failedMessage(steered.message_id, outcome.reason, outcome.code);
    const finished = (): void => {
      if (outcome.ok) deps.finished(steered, outcome.text, true);
      else deps.finished(steered, outcome.reason, false);
    };
    background(
      written.then(finished, (cause: unknown) => {
        finished();
        throw cause;
      }),
      'computer.steered_state_failed',
      { eventId: steered.id },
    );
  }
}

export function afterTurnWrites(
  deps: Pick<ComputerRunnerDeps, 'log'>,
  turn: Turn,
  written: Promise<unknown>,
  after: () => void,
): void {
  const settled = written
    .then(after, (cause: unknown) => {
      deps.log.warn('computer.turn_write_failed', {
        chatId: turn.chat.id,
        eventId: turn.event.id,
        failure: messageOf(cause),
      });
      after();
    })
    .finally(() => {
      turn.finish();
    });
  background(settled, 'computer.turn_settle_failed', { eventId: turn.event.id });
}
